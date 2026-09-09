const formatTime = () => new Date().toISOString();

module.exports = {
  log: (...args) => console.log(`[${formatTime()}] [LOG]`, ...args),
  info: (...args) => console.info(`[${formatTime()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${formatTime()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${formatTime()}] [ERROR]`, ...args),
};
