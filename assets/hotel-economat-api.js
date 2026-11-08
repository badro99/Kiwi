/* The economat client surface: HTTP attempts (transport) and durable submissions (outbox) behind one
   import. Nothing here has logic of its own, so no module has to import a module that imports it. */
export { getJson, post } from './hotel-economat-transport.js?v=27';
export { discard, enqueueRequest, replay, snapshot, subscribe } from './hotel-economat-outbox.js?v=21';
