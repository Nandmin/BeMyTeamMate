import { RateLimiter, RateLimitExceededError } from '../rate-limiter.js';

export { RateLimitExceededError };
export const rateLimiter = new RateLimiter();
