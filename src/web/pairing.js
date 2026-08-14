const socket = io();

const statusEl = document.querySelector('.status-indicator');
const runLocationEl = document.getElementById('runLocation');

socket.on('connect', () => {
  if (statusEl) {
    statusEl.classList.remove('disconnected');
    statusEl.classList.add('connected');
  }
});

socket.on('disconnect', () => {
  if (statusEl) {
    statusEl.classList.remove('connected');
    statusEl.classList.add('disconnected');
  }
});

socket.on('state', (state) => {
  // Extract and display run location
  if (state.runLocation && runLocationEl) {
    runLocationEl.textContent = state.runLocation;
    runLocationEl.style.color = state.runLocation === 'LOCAL' ? '#22c55e' : '#f59e0b';
  }
});
