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

  getKvBinding(env) {
    const kv = env?.RATE_LIMIT_KV;
    if (kv) return kv;

    const bypassRaw = env?.ALLOW_RATE_LIMIT_BYPASS;
    const allowBypass = typeof bypassRaw === 'string' && bypassRaw.trim().toLowerCase() === 'true';
    if (allowBypass) {
      console.warn('Rate limits disabled by ALLOW_RATE_LIMIT_BYPASS');
      return null;
    }

    throw new Error('RATE_LIMIT_KV not configured');
  }

  async checkGlobal(env, scope = 'all') {
    const kv = this.getKvBinding(env);
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

  async check(request, env, userId, options = {}) {
    const kv = this.getKvBinding(env);
    if (!kv) return true;

    const ip = this.getClientIp(request) || 'unknown';
    const now = Math.floor(Date.now() / 1000);
    const checkIp = options.checkIp !== false;
    const checkUser = options.checkUser !== false;
    const ipLimit = Number.isFinite(options.ipLimit) ? Number(options.ipLimit) : this.limits.perIP.max;
    const ipWindowSeconds = Number.isFinite(options.ipWindow)
      ? Number(options.ipWindow)
      : this.limits.perIP.window;
    const userLimit = Number.isFinite(options.userLimit) ? Number(options.userLimit) : this.limits.perUser.max;
    const userWindowSeconds = Number.isFinite(options.userWindow)
      ? Number(options.userWindow)
      : this.limits.perUser.window;
    const keyPrefix = typeof options.keyPrefix === 'string' && options.keyPrefix.trim()
      ? options.keyPrefix.trim()
      : 'rl';

    let ipKey = '';
    let ipCount = 0;
    if (checkIp) {
      const ipWindow = Math.floor(now / ipWindowSeconds);
      ipKey = `${keyPrefix}:ip:${ip}:${ipWindow}`;
      const ipCountRaw = await kv.get(ipKey);
      ipCount = Number.parseInt(ipCountRaw || '0', 10) || 0;
    }

    if (checkIp && ipCount >= ipLimit) {
      const retryAfter = this.secondsUntilWindowReset(now, ipWindowSeconds);
      throw new RateLimitExceededError(
        `IP rate limit exceeded. Try again in ${retryAfter}s`,
        retryAfter
      );
    }

    let userKey = '';
    let userCount = 0;
    if (checkUser && userId) {
      const userWindow = Math.floor(now / userWindowSeconds);
      userKey = `${keyPrefix}:user:${String(userId)}:${userWindow}`;
      const userCountRaw = await kv.get(userKey);
      userCount = Number.parseInt(userCountRaw || '0', 10) || 0;

      if (userCount >= userLimit) {
        const retryAfter = this.secondsUntilWindowReset(now, userWindowSeconds);
        throw new RateLimitExceededError(
          `User rate limit exceeded. Try again in ${retryAfter}s`,
          retryAfter
        );
      }
    }

    const writes = [];
    if (checkIp) {
      writes.push(
        kv.put(ipKey, String(ipCount + 1), { expirationTtl: ipWindowSeconds * 2 })
      );
    }
    if (userKey) {
      writes.push(
        kv.put(userKey, String(userCount + 1), {
          expirationTtl: userWindowSeconds * 2,
        })
      );
    }
    if (writes.length > 0) {
      await Promise.all(writes);
    }
    return true;
  }

  async checkContact(request, env) {
    const kv = this.getKvBinding(env);
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
