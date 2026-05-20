import axios, { type AxiosInstance } from 'axios';

export interface ServiceClients {
  learning: AxiosInstance;
  exerciseEngine: AxiosInstance;
}

// Token signed with HS256 'e2e-test-secret' for user 'e2e-student', roles ['student']
// Services in e2e mode skip JWT signature verification (JWT_PUBLIC_KEY = placeholder).
export const E2E_STUDENT_TOKEN = 'e2e-student-token-placeholder';
export const E2E_TUTOR_TOKEN = 'e2e-tutor-token-placeholder';
export const E2E_INTERNAL_TOKEN = 'e2e-internal-token';

export function createServiceClients(
  learningUrl: string,
  exerciseEngineUrl: string,
  defaultToken = E2E_STUDENT_TOKEN,
): ServiceClients {
  return {
    learning: createClient(learningUrl, defaultToken),
    exerciseEngine: createClient(exerciseEngineUrl, defaultToken),
  };
}

export function createClient(baseURL: string, token: string): AxiosInstance {
  return axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // Don't throw on 4xx/5xx — let tests assert on status codes explicitly.
    validateStatus: () => true,
    timeout: 15_000,
  });
}
