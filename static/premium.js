(function () {
  'use strict';

  const root = document.getElementById('app');
  if (!root) return;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const isAuthForm = form => Boolean(form.closest('.auth-panel'));
  const usernamePattern = /^[a-zA-Z][a-zA-Z0-9_]{2,23}$/;
  let availabilityTimer = 0;
  let availabilitySequence = 0;
  let enhanceQueued = false;
  const availability = {value:'',state:'',checking:false};
  const eyeSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOffSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18M10.6 5.1A10.2 10.2 0 0 1 12 5c6 0 10 7 10 7a14.4 14.4 0 0 1-4.2 4.8M6.2 6.2C3.6 8 2 12 2 12s4 7 10 7c1.5 0 2.9-.4 4.2-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function fieldOf(input) { return input.closest('.field') || input.closest('label') || input.parentElement; }

  function markError(input, message) {
    const holder = fieldOf(input);
    if (!holder) return;
    holder.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    let error = holder.querySelector('.field-error');
    if (!error) {
      error = document.createElement('div');
      error.className = 'field-error';
      error.setAttribute('role', 'status');
      holder.append(error);
    }
    error.textContent = message;
    if (input.id) {
      error.id = input.id + '-error';
      input.setAttribute('aria-describedby', error.id);
    }
  }

  function clearError(input) {
    const holder = fieldOf(input);
    if (holder) {
      holder.classList.remove('has-error');
      holder.querySelector('.field-error')?.remove();
    }
    input.removeAttribute('aria-invalid');
    if (input.getAttribute('aria-describedby')?.endsWith('-error')) {
      input.removeAttribute('aria-describedby');
    }
  }

  function explainInvalid(input) {
    const value = input.type === 'checkbox' ? input.checked : input.value.trim();
    if (input.required && !value) {
      return input.type === 'checkbox'
        ? 'Bạn cần xác nhận điều khoản trước khi tiếp tục.'
        : 'Vui lòng nhập thông tin này trước khi tiếp tục.';
    }
    if (!input.validity.valid) {
      if (input.name === 'username') return 'Tên tài khoản cần 3–24 ký tự, bắt đầu bằng chữ và chỉ chứa a–z, 0–9 hoặc _.';
      if (input.name.includes('pin')) {
        if (['login-pin', 'login-remembered'].includes(input.form?.dataset.form)) {
          return 'Mã PIN không chính xác. Vui lòng thử lại.';
        }
        const length = Number(input.form?.querySelector('[name="pin_length"]')?.value || input.maxLength || input.minLength);
        return length >= 4 && length <= 6
          ? 'Vui lòng nhập mã PIN gồm đúng ' + length + ' chữ số (0–9).'
          : 'Mã PIN chỉ được chứa các chữ số từ 0 đến 9.';
      }
      if (input.validity.tooShort) return 'Cần nhập tối thiểu ' + input.minLength + ' ký tự.';
      if (input.validity.tooLong) return 'Vui lòng nhập không quá ' + input.maxLength + ' ký tự.';
      if (input.validity.patternMismatch) return 'Định dạng chưa đúng. Vui lòng kiểm tra lại.';
      if (input.validity.rangeUnderflow || input.validity.rangeOverflow) return 'Giá trị không nằm trong khoảng cho phép.';
      return 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.';
    }
    if (input.name === 'phone' && value) {
      const normalized = value.replace(/[\s().-]/g, '');
      if (!/^(?:0[0-9]{9}|\+[1-9][0-9]{7,14})$/.test(normalized))
        return 'Vui lòng nhập số điện thoại Việt Nam 10 chữ số hoặc số quốc tế có mã quốc gia.';
    }
    if ((input.name === 'repeat-password' || input.name === 'repeat_password')) {
      const peer = input.form?.querySelector('[name="new-password"],[name="new_password"]');
      if (peer && input.value !== peer.value) return 'Hai lần nhập mật khẩu chưa khớp.';
    }
    if (input.name === 'repeat-pin') {
      const peer = input.form?.querySelector('[name="new-pin"]');
      if (peer && input.value !== peer.value) return 'Hai lần nhập mã PIN chưa khớp.';
    }
    if (input.name === 'new-pin' || input.name === 'repeat-pin') {
      const select = input.form?.querySelector('[name="pin_length"]');
      const n = Number(select?.value || 4);
      if (!new RegExp('^[0-9]{' + n + '}$').test(input.value)) return 'Vui lòng nhập mã PIN gồm đúng ' + n + ' chữ số (0–9).';
    }
    if (input.name === 'username' && input.form?.dataset.form === 'register-request') {
      if (availability.value === input.value.trim().toLowerCase() &&
          ['exists', 'reserved'].includes(availability.state)) {
        return 'Tên đã có người sử dụng hoặc đang được phê duyệt.';
      }
    }
    return '';
  }

  function strength(password) {
    let points = 0;
    if (password.length >= 8) points++;
    if (password.length >= 12) points++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) points++;
    if (/[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password)) points++;
    return Math.max(0, Math.min(4, points));
  }

  function updateStrength(input) {
    const holder = fieldOf(input);
    const box = holder?.querySelector('.password-strength');
    if (!box) return;
    const n = strength(input.value);
    const colors = ['#54627f', '#ff9d88', '#f2c577', '#75cbe6', '#5ce1ad'];
    const labels = ['Nhập mật khẩu để kiểm tra độ mạnh', 'Yếu · nên dùng mật khẩu dài hơn',
      'Trung bình · thêm ký tự đa dạng', 'Khá tốt', 'Mạnh · vẫn nên dùng mật khẩu riêng'];
    box.style.setProperty('--strength-color', colors[n]);
    $$('.password-strength-track span', box).forEach((bar, i) => bar.classList.toggle('on', i < n));
    $('.password-strength-caption', box).textContent = labels[n];
  }

  function updateAvailability(text, kind) {
    const input = $('.auth-panel form[data-form="register-request"] [name="username"]');
    const target = input && fieldOf(input)?.querySelector('.username-status');
    if (!target) return;
    target.className = 'username-status ' + (kind || '');
    target.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    const label = document.createElement('span');
    label.textContent = text;
    target.append(dot, label);
  }

  function checkUsername(input) {
    clearTimeout(availabilityTimer);
    const value = input.value.trim().toLowerCase();
    const seq = ++availabilitySequence;
    availability.value = value;
    availability.state = '';
    if (!value) {
      updateAvailability('Chọn một tên để bắt đầu', '');
      return;
    }
    if (!usernamePattern.test(value)) {
      updateAvailability('Dùng 3–24 ký tự, chữ cái, số và dấu _', '');
      return;
    }
    availability.checking = true;
    updateAvailability('Đang kiểm tra tên tài khoản…', 'checking');
    availabilityTimer = setTimeout(async () => {
      try {
        const response = await fetch('/api/username/check', {
          method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({username:value})
        });
        const data = await response.json();
        if (seq !== availabilitySequence || input.value.trim().toLowerCase() !== value) return;
        availability.state = data.state || '';
        if (!response.ok) {
          updateAvailability('Không kiểm tra được lúc này; bạn vẫn có thể gửi yêu cầu.', '');
        } else if (data.state === 'available') {
          updateAvailability('Tên này đang có thể sử dụng', 'good');
        } else {
          updateAvailability('Tên đã có người sử dụng hoặc đang được phê duyệt.', 'bad');
        }
      } catch {
        if (seq === availabilitySequence) updateAvailability('Mạng chưa ổn định; hãy thử lại.', '');
      } finally {
        if (seq === availabilitySequence) availability.checking = false;
      }
    }, 430);
  }

  function enhance() {
    $$('.auth-panel form[data-form]').forEach(form => { form.noValidate = true; });
    $$('form[data-form]').forEach(form => { form.noValidate = true; });
    $$('.field input[type="password"]').forEach(input => {
      if (input.dataset.premiumEnhanced) return;
      input.dataset.premiumEnhanced = '1';
      const wrap = document.createElement('div');
      wrap.className = 'password-field';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'password-toggle';
      toggle.setAttribute('aria-label', 'Hiện mật khẩu hoặc mã PIN');
      toggle.setAttribute('title', 'Hiện / ẩn mật khẩu');
      toggle.innerHTML = eyeSvg;
      toggle.addEventListener('click', () => {
        const showing = input.type === 'password';
        input.type = showing ? 'text' : 'password';
        toggle.innerHTML = showing ? eyeOffSvg : eyeSvg;
        toggle.setAttribute('aria-label', showing ? 'Ẩn mật khẩu hoặc mã PIN' : 'Hiện mật khẩu hoặc mã PIN');
        input.focus({preventScroll:true});
      });
      wrap.append(toggle);
    });

    const username = $('.auth-panel form[data-form="register-request"] [name="username"]');
    if (username && !fieldOf(username)?.querySelector('.username-status')) {
      const label = document.createElement('div');
      label.className = 'username-status';
      label.setAttribute('aria-live', 'polite');
      fieldOf(username).append(label);
      checkUsername(username);
    }

    const password = $('.auth-panel form[data-form="register-complete"] [name="new-password"]');
    if (password && !fieldOf(password)?.querySelector('.password-strength')) {
      const el = document.createElement('div');
      el.className = 'password-strength';
      el.innerHTML = '<div class="password-strength-track"><span></span><span></span><span></span><span></span></div><div class="password-strength-caption"></div>';
      fieldOf(password).append(el);
      updateStrength(password);
    }
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {enhanceQueued = false; enhance();});
  }

  document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    let firstInvalid = null;
    $$('input,select,textarea', form).forEach(input => {
      if (input.disabled || input.type === 'hidden' || input.type === 'button') return;
      const message = explainInvalid(input);
      if (message) {
        markError(input, message);
        if (!firstInvalid) firstInvalid = input;
      } else clearError(input);
    });

    if (firstInvalid) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const input = firstInvalid;
      const field = fieldOf(input);
      field?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
      input.focus({preventScroll:true});
      return;
    }

    const button = form.querySelector('button[type="submit"],button:not([type])');
    if (button) {
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
    }
  }, true);

  document.addEventListener('input', event => {
    const input = event.target;
    if (!input.matches('input,textarea,select')) return;
    if (input.closest('.field')) {
      clearError(input);
      if (input.name === 'new-password' && input.closest('.auth-panel')) updateStrength(input);
      if (input.name === 'username' && input.form?.dataset.form === 'register-request') checkUsername(input);
    }
  });

  document.addEventListener('change', event => {
    const input = event.target;
    if (input.name === 'pin_length' && input.form?.dataset.form === 'register-complete') {
      $$('[name="new-pin"],[name="repeat-pin"]', input.form).forEach(x => clearError(x));
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const cancel = $('#modal-cancel');
      if (cancel && $('#modal-root .modal-backdrop')) cancel.click();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      const search = $('#side-filter') || $('#people-search') || $('.side-top input[type="search"]');
      if (search) {event.preventDefault();search.focus();search.select();}
    }
  });

  const offline = document.createElement('div');
  offline.className = 'premium-offline';
  offline.setAttribute('role', 'status');
  offline.hidden = true;
  offline.textContent = 'Bạn đang ngoại tuyến. Tin nhắn sẽ hoạt động lại khi có Internet.';
  document.body.appendChild(offline);
  function syncOnlineState() {
    offline.hidden = navigator.onLine !== false;
    if (navigator.onLine && typeof window.toast === 'function' && offline.dataset.wasOffline === '1') {
      window.toast('Kết nối Internet đã khôi phục.', 'ok');
    }
    if (!navigator.onLine) offline.dataset.wasOffline = '1';
  }
  window.addEventListener('online', syncOnlineState);
  window.addEventListener('offline', syncOnlineState);
  syncOnlineState();

  const watcher = new MutationObserver(mutations => {
    let needsEnhance = false;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
        const button = mutation.target;
        if (button.classList?.contains('is-loading') && !button.disabled) {
          button.classList.remove('is-loading');
          button.removeAttribute('aria-busy');
        }
      }
      if (mutation.type === 'childList' && mutation.addedNodes.length) needsEnhance = true;
    }
    if (needsEnhance) scheduleEnhance();
  });
  watcher.observe(root, {childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  document.addEventListener('DOMContentLoaded', scheduleEnhance, {once:true});
  scheduleEnhance();
})();
