export class RateLimitExceededError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimitExceededError';
    this.retryAfter = retryAfter;
  }
}

export class RateLimiter {
  constructor(limits = {
    perIP: { max: 300, window: 60 },
    perUser: { max: 100, window: 60 },
  }) {
    this.limits = limits;
  }

  async check(request, env, userId) {
    const kv = env?.RATE_LIMIT_KV;
    if (!kv) return true;

    const ip = this.getClientIp(request) || 'unknown';
    const now = Math.floor(Date.now() / 1000);

    const ipWindow = Math.floor(now / this.limits.perIP.window);
    const ipKey = `rl:ip:${ip}:${ipWindow}`;
    const ipCountRaw = await kv.get(ipKey);
    const ipCount = Number.parseInt(ipCountRaw || '0', 10) || 0;

    if (ipCount >= this.limits.perIP.max) {
      const retryAfter = this.secondsUntilWindowReset(now, this.limits.perIP.window);
      throw new RateLimitExceededError(
        `IP rate limit exceeded. Try again in ${retryAfter}s`,
        retryAfter
      );
    }

    let userKey = '';
    let userCount = 0;
    if (userId) {
      const userWindow = Math.floor(now / this.limits.perUser.window);
      userKey = `rl:user:${String(userId)}:${userWindow}`;
      const userCountRaw = await kv.get(userKey);
      userCount = Number.parseInt(userCountRaw || '0', 10) || 0;

      if (userCount >= this.limits.perUser.max) {
        const retryAfter = this.secondsUntilWindowReset(now, this.limits.perUser.window);
        throw new RateLimitExceededError(
          `User rate limit exceeded. Try again in ${retryAfter}s`,
          retryAfter
        );
      }
    }

    const writes = [
      kv.put(ipKey, String(ipCount + 1), { expirationTtl: this.limits.perIP.window * 2 }),
    ];
    if (userKey) {
      writes.push(
        kv.put(userKey, String(userCount + 1), {
          expirationTtl: this.limits.perUser.window * 2,
        })
      );
    }
    await Promise.all(writes);
    return true;
  }

  getClientIp(request) {
    const direct = request.headers.get('CF-Connecting-IP');
    if (direct) return direct;
    const forwarded = request.headers.get('X-Forwarded-For');
    if (!forwarded) return '';
    return forwarded.split(',')[0].trim();
  }

  secondsUntilWindowReset(now, windowSeconds) {
    const elapsed = now % windowSeconds;
    return Math.max(1, windowSeconds - elapsed);
  }
}
