import router, { deviceIngest } from './routes';
export { startGateway } from './gateway';

/**
 * Devices (RFID readers over TCP, HTTP/IoT senders): every reading goes through one pipeline (debounce → log → write into the
 * sheets bound to the device using their scan formats). Independent of the pages: runs on the server.
 */
export default { router, ingest: deviceIngest };
