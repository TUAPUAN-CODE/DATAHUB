import router, { lineWebhook } from './routes';
export { startLineWorker } from './worker';

/**
 * LINE alerts: when a row reaches an alert level (validation.alert.notify) the chosen LINE user / group gets one message.
 * Independent of the colour alert in the browser — it only reads validation.alert and the cells.
 */
export default { router, webhook: lineWebhook };
