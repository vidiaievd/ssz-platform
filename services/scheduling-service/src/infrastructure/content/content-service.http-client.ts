import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import type {
  CourseOutline,
  ICourseOutlineReader,
} from '../../modules/slots/application/ports/course-outline.reader.js';

@Injectable()
export class ContentServiceHttpClient implements ICourseOutlineReader {
  private readonly logger = new Logger(ContentServiceHttpClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ConfigService<AppConfig>) {
    const content = config.get<AppConfig['content']>('content');
    this.baseUrl = content?.baseUrl ?? 'http://content-service:3003';
    this.token = content?.token ?? '';
  }

  async forCourse(courseId: string): Promise<CourseOutline | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/internal/containers/${courseId}/outline`,
        // content-service gates /internal/* behind InternalAuthGuard, which reads
        // the shared token from x-internal-token. Sent as a Bearer it 401s, and
        // the caller reads that as "the course has no content".
        { headers: { 'x-internal-token': this.token } },
      );
      if (!res.ok) {
        this.logger.warn(`forCourse: content-service returned ${res.status} for course ${courseId}`);
        return null;
      }
      const body = (await res.json()) as CourseOutline;
      return { versionId: body.versionId ?? null, units: body.units ?? [] };
    } catch (err) {
      this.logger.warn(`forCourse failed: ${String(err)}`);
      return null;
    }
  }
}
