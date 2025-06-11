export default {
  url: `redis://${process.env.REDIS_HOST || '0.0.0.0'}:${process.env.REDIS_PORT || 6379}/4`,
}
