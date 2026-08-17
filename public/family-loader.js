(() => {
  const root = document.documentElement;
  root.classList.add('family-os-loading');

  const loader = document.getElementById('family-os-loader');
  const status = document.getElementById('family-os-loader-status');
  const percent = document.getElementById('family-os-loader-percent');
  const progress = document.getElementById('family-os-loader-progress');
  if (!loader || !status || !percent || !progress) {
    root.classList.remove('family-os-loading');
    return;
  }

  const startedAt = performance.now();
  const MIN_VISIBLE_MS = 520;
  let value = 4;
  let completed = false;
  let readyRequested = false;

  const stages = [
    [16, 'Starting Family OS'],
    [34, 'Preparing family timeline'],
    [52, 'Loading weather and astronomy'],
    [70, 'Preparing moon-base interface'],
    [86, 'Finishing command center'],
  ];

  const paint = (next, label) => {
    value = Math.max(value, Math.min(100, next));
    progress.style.width = `${value}%`;
    percent.textContent = `${Math.round(value)}%`;
    if (label) status.textContent = label;
  };

  const finish = () => {
    if (completed) return;
    completed = true;
    paint(100, 'Command center online');
    const elapsed = performance.now() - startedAt;
    const delay = Math.max(120, MIN_VISIBLE_MS - elapsed);
    window.setTimeout(() => {
      loader.classList.add('is-complete');
      root.classList.remove('family-os-loading');
      window.setTimeout(() => loader.remove(), 520);
    }, delay);
  };

  const timer = window.setInterval(() => {
    if (completed) {
      clearInterval(timer);
      return;
    }
    const nextStage = stages.find(([threshold]) => value < threshold);
    if (nextStage) {
      const [threshold, label] = nextStage;
      paint(Math.min(threshold, value + 5 + Math.random() * 7), label);
    } else if (value < 92) {
      paint(Math.min(92, value + 1.5));
    }
  }, 220);

  window.addEventListener('family-os:app-ready', () => {
    readyRequested = true;
    finish();
  }, { once: true });

  window.addEventListener('error', () => {
    if (!readyRequested && !completed) paint(Math.max(value, 72), 'Recovering core interface');
  });

  window.addEventListener('unhandledrejection', () => {
    if (!readyRequested && !completed) paint(Math.max(value, 72), 'Recovering core interface');
  });

  // Critical safety rule: the loader is never allowed to trap the application.
  window.setTimeout(() => {
    if (!completed) {
      paint(96, 'Launching core interface');
      finish();
    }
  }, 7000);
})();
