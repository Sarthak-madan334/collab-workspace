import { error } from './errors.js';

export class RateLimiter {
  constructor(maxBuckets = 10000) { this.buckets = new Map(); this.maxBuckets = maxBuckets; }
  check(key, maximum, windowMs, cost = 1) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.until <= now) {
      if (!bucket && this.buckets.size >= this.maxBuckets) {
        for (const [entry, value] of this.buckets) if (value.until <= now) this.buckets.delete(entry);
        if (this.buckets.size >= this.maxBuckets) throw error(429, 'RATE_LIMITED', 'Server is busy. Try again shortly');
      }
      bucket = { count: 0, until: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += cost;
    if (bucket.count > maximum) {
      const failure = error(429, 'RATE_LIMITED', 'Too many attempts. Try again shortly');
      failure.retryAfter = Math.max(1, Math.ceil((bucket.until - now) / 1000));
      throw failure;
    }
  }
}
