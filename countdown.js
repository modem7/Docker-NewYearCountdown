'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    cd_title: document.getElementById('cd-title'),
    cd_days: document.getElementById('cd-days'),
    cd_hours: document.getElementById('cd-hours'),
    cd_mins: document.getElementById('cd-mins'),
    cd_secs: document.getElementById('cd-secs'),
    cd_timetil: document.getElementById('cd-timetil'),
  };

  const SEC = 1000;
  const MIN = SEC * 60;
  const HOUR = MIN * 60;
  const DAY = HOUR * 24;

  const setValue = (valueEl, value, width, singularLabel) => {
    valueEl.textContent = String(value).padStart(width, '0');
    valueEl.nextElementSibling.textContent = singularLabel + (value === 1 ? '' : 's');
  };

  const nextYear = new Date().getFullYear() + 1;
  elements.cd_title.textContent += ' ' + nextYear;

  // Next January 1st, 00:00:00 local time.
  const endDate = new Date(nextYear + '/1/1');
  elements.cd_timetil.textContent = 'Time until ' + endDate.toDateString();

  const cdInterval = setInterval(() => {
    const diff = endDate.getTime() - new Date().getTime();
    if (diff <= 0) {
      elements.cd_title.classList.add('cd__title--newyear');
      elements.cd_title.textContent = 'Happy New Year!';
      clearInterval(cdInterval);
      return;
    }
    setValue(elements.cd_days, Math.floor(diff / DAY), 3, 'Day');
    setValue(elements.cd_hours, Math.floor((diff % DAY) / HOUR), 2, 'Hour');
    setValue(elements.cd_mins, Math.floor((diff % HOUR) / MIN), 2, 'Minute');
    setValue(elements.cd_secs, Math.floor((diff % MIN) / SEC), 2, 'Second');
  }, 1000);
});
