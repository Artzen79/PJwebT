// One live-availability stream shared by every open tab of the site.
// Browsers allow only 6 HTTP/1.1 connections per host; a stream per tab used them all up
// once a few tabs were open, and every other request then queued behind them.
const ports = new Set();
const source = new EventSource('/api/v1/events/availability');

source.addEventListener('availability', (event) => {
  for (const port of ports) port.postMessage(event.data);
});

onconnect = (event) => {
  const port = event.ports[0];
  ports.add(port);
  // a tab says goodbye when it closes or unmounts; the worker (and its stream) ends with the last tab
  port.onmessage = (message) => {
    if (message.data === 'close') ports.delete(port);
  };
  port.start();
};
