import { Injectable } from '@nestjs/common';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { WebsocketMessageAdapter } from 'microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.browser/Exports.js';
import { LlmError } from '../../domain/llm-error.js';
import { ticksToMs, type AzureRecognition, type AzureSegment } from './azure-result.js';

// The SDK prefers the runtime's own WebSocket when there is one. Node 22's fires `error` but
// never `close` when the handshake is refused (a bad key, 429), and the SDK waits for `close`
// until our timeout. The `ws` package closes, and says which status refused it.
WebsocketMessageAdapter.forceNpmWebSocket = true;

export interface ContinuousInput {
  /** The resource's speech endpoint, as the registry has it (`https://<region>.stt.speech.microsoft.com`). */
  baseUrl: string;
  key: string;
  locale: string;
  wav: Uint8Array;
  /** The passage to assess against; null = recognition only, the passage is not sent. */
  referenceText: string | null;
  timeoutMs: number;
}

export interface ContinuousRecognition {
  segments: AzureSegment[];
  sessionId: string | null;
}

/**
 * Continuous recognition through the Speech SDK (plan 82, step 9b) — the way to assess audio
 * longer than the REST endpoint's 30 s. The service splits the recording into phrases and
 * answers each with its own JSON; they are collected until the stream ends.
 *
 * Miscue is off: with it on, every phrase would be aligned with the whole passage and report
 * the rest of it as omitted. `mergeSegments` aligns the whole recording with the passage instead.
 *
 * Raises `LlmError` only, like an adapter: a cancellation maps by its error code.
 */
@Injectable()
export class AzureContinuousRecognizer {
  recognize(input: ContinuousInput): Promise<ContinuousRecognition> {
    const config = sdk.SpeechConfig.fromHost(new URL(`wss://${new URL(input.baseUrl).host}`), input.key);
    config.speechRecognitionLanguage = input.locale;
    config.outputFormat = sdk.OutputFormat.Detailed;
    config.requestWordLevelTimestamps();
    const audio = sdk.AudioConfig.fromWavFileInput(Buffer.from(input.wav));
    const recognizer = new sdk.SpeechRecognizer(config, audio);
    if (input.referenceText !== null) {
      new sdk.PronunciationAssessmentConfig(
        input.referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Word,
        false,
      ).applyTo(recognizer);
    }

    return new Promise((resolve, reject) => {
      const segments: AzureSegment[] = [];
      let sessionId: string | null = null;
      let settled = false;

      const finish = (error?: LlmError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const close = () => recognizer.close();
        recognizer.stopContinuousRecognitionAsync(close, close);
        if (error) reject(error);
        else resolve({ segments, sessionId });
      };
      const timer = setTimeout(() => finish(new LlmError('timeout', 'Azure Speech: recognition timed out')), input.timeoutMs);

      recognizer.sessionStarted = (_sender, e) => {
        sessionId = e.sessionId;
      };
      recognizer.recognized = (_sender, e) => {
        if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
        const json = e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
        const segment = segmentOf(json);
        if (segment) segments.push(segment);
      };
      recognizer.canceled = (_sender, e) => {
        if (e.reason === sdk.CancellationReason.EndOfStream) finish();
        else finish(fromCancellation(sdk.CancellationErrorCode[e.errorCode] ?? 'unknown', e.errorDetails));
      };
      recognizer.sessionStopped = () => finish();
      recognizer.startContinuousRecognitionAsync(
        () => undefined,
        (err) => finish(new LlmError('unavailable', `Azure Speech: could not start — ${err}`)),
      );
    });
  }
}

/** One phrase's JSON; null when it is not a recognized phrase with a best result. */
export function segmentOf(json: string): AzureSegment | null {
  let body: AzureRecognition;
  try {
    body = JSON.parse(json) as AzureRecognition;
  } catch {
    return null;
  }
  const best = body?.NBest?.[0];
  return best ? { best, durationMs: ticksToMs(body.Duration) } : null;
}

/**
 * A cancellation's error code (`CancellationErrorCode` by name) as the router reads failures.
 * A refused handshake is `ConnectionFailure` whatever the reason; the status in its details
 * (`Unexpected server response: 401`) tells a bad key and a full quota from an outage.
 */
export function fromCancellation(code: string, details: string): LlmError {
  const message = `Azure Speech ${code}: ${details.slice(0, 300)}`;
  const status = Number(/server response: (\d{3})/.exec(details)?.[1]);
  if (code === 'ConnectionFailure' && (status === 401 || status === 403)) return new LlmError('auth', message);
  if (code === 'ConnectionFailure' && status === 429) return new LlmError('rate_limited', message);
  switch (code) {
    case 'AuthenticationFailure':
    case 'Forbidden':
      return new LlmError('auth', message);
    case 'BadRequestParameters':
      return new LlmError('invalid_request', message);
    case 'TooManyRequests':
      return new LlmError('rate_limited', message);
    case 'ServiceTimeout':
      return new LlmError('timeout', message);
    case 'ConnectionFailure':
    case 'ServiceError':
      return new LlmError('unavailable', message);
    default:
      return new LlmError('unknown', message);
  }
}
