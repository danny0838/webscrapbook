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

function onRadioInput(event) {
  const elem = event.currentTarget;
  if (elem.checked) {
    const value = Boolean(elem.value);
    messagePort.postMessage({cmd: 'result', args: {value}});
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  const form = document.body.appendChild(document.createElement('form'));

  const label = form.appendChild(document.createElement('label'));
  label.textContent = `Does it work?`;

  const label1 = form.appendChild(document.createElement('label'));
  const input1 = label1.appendChild(document.createElement('input'));
  input1.type = 'radio';
  input1.name = 'work';
  input1.value = 'true';
  input1.addEventListener('change', onRadioInput);
  label1.append('YES');

  const label2 = form.appendChild(document.createElement('label'));
  const input2 = label2.appendChild(document.createElement('input'));
  input2.type = 'radio';
  input2.name = 'work';
  input2.value = '';
  input2.addEventListener('change', onRadioInput);
  label2.append('NO');
});

function loadEnv(message, port) {
  const localhost = message.localhost;
  Array.prototype.forEach.call(document.querySelectorAll('a[data-path]'), (elem) => {
    elem.target = '_blank';
    elem.href = `${localhost}${elem.getAttribute('data-path')}`;
  });
}
