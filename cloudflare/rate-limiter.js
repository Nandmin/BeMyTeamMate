export class RateLimitExceededError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimitExceededError';
    this.retryAfter = retryAfter;
  }
}

export class RateLimiter {
  constructor(limits = {
    perIP: { max: 60, window: 60 },
    perUser: { max: 30, window: 60 },
    global: { max: 1000, window: 60 },
    contact: { max: 3, window: 3600 },
  }) {
    this.limits = limits;
  }

  async checkGlobal(env, scope = 'all') {
    const kv = env?.RATE_LIMIT_KV;
    if (!kv) return true;

    const now = Math.floor(Date.now() / 1000);
    const windowSeconds = this.limits.global.window;
    const window = Math.floor(now / windowSeconds);
    const key = `rl:global:${scope}:${window}`;
    const count = Number.parseInt((await kv.get(key)) || '0', 10) || 0;

    if (count >= this.limits.global.max) {
      const retryAfter = this.secondsUntilWindowReset(now, windowSeconds);
      throw new RateLimitExceededError(
        `Global rate limit exceeded. Try again in ${retryAfter}s`,
        retryAfter
      );
    }

    await kv.put(key, String(count + 1), {
      expirationTtl: windowSeconds * 2,
    });
    return true;
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

  async checkContact(request, env) {
    const kv = env?.RATE_LIMIT_KV;
    if (!kv) return true;

    const ip = this.getClientIp(request) || 'unknown';
    const now = Math.floor(Date.now() / 1000);
    const windowSeconds = this.limits.contact.window;
    const window = Math.floor(now / windowSeconds);
    const key = `rl:contact:${ip}:${window}`;
    const count = Number.parseInt((await kv.get(key)) || '0', 10) || 0;

    if (count >= this.limits.contact.max) {
      const retryAfter = this.secondsUntilWindowReset(now, windowSeconds);
      throw new RateLimitExceededError(
        `Contact rate limit exceeded. Try again in ${retryAfter}s`,
        retryAfter
      );
    }

    await kv.put(key, String(count + 1), {
      expirationTtl: windowSeconds * 2,
    });
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
