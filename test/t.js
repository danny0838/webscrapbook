'use strict';

var messagePort;

chrome.runtime.onConnect.addListener((port) => {
  messagePort = port;
  port.onMessage.addListener(async (message, port) => {
    try {
      const {cmd, args} = message;
      await window[cmd](args, port);
    } catch (ex) {
      port.postMessage({id: message.id, error: {message: ex.message}});
    }
  });
});

document.addEventListener("DOMContentLoaded", async function () {
  const form = document.createElement('form');
  const label = form.appendChild(document.createElement('label'));
  label.textContent = `Does it work?`;
  const input1 = form.appendChild(document.createElement('input'));
  input1.type = 'radio';
  input1.name = 'work';
  const label1 = form.appendChild(document.createElement('label'));
  label1.textContent = 'yes';
  const input2 = form.appendChild(document.createElement('input'));
  input2.type = 'radio';
  input2.name = 'work';
  const label2 = form.appendChild(document.createElement('label'));
  label2.textContent = 'no';
  document.body.appendChild(form);

  input1.addEventListener('change', (event) => {
    if (event.currentTarget.checked) {
      messagePort.postMessage({cmd: 'result', args: {value: true}});
    }
  });

  input2.addEventListener('change', (event) => {
    if (event.currentTarget.checked) {
      messagePort.postMessage({cmd: 'result', args: {value: false}});
    }
  });
});

function loadEnv(message, port) {
  const localhost = message.localhost;
  Array.prototype.forEach.call(document.querySelectorAll('a[data-path]'), (elem) => {
    elem.target = '_blank';
    elem.href = `${localhost}${elem.getAttribute('data-path')}`;
  });
}
