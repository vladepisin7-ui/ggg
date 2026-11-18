(function(){
  // ---------- API — относительный путь (тот же домен) ----------
  var API_URL = "";

  // ---------- состояние ----------
  var cart = {};
  try { cart = JSON.parse(localStorage.getItem('kr_cart') || '{}'); } catch(e){ cart = {}; }
  var mode = localStorage.getItem('kr_mode') || 'pickup';       // pickup | delivery | booking
  var guests = parseInt(localStorage.getItem('kr_guests') || '2', 10);
  if (guests < 1 || guests > 30 || isNaN(guests)) guests = 2;

  var MIN_WAIT = { pickup: 60, delivery: 120, booking: 60 };    // минуты от момента заказа
  var STEP = 15, OPEN_H = 10, CLOSE_H = 23;                     // часы работы кафе

  var els = {
    count: document.getElementById('cartCount'),
    drawerCount: document.getElementById('drawerCount'),
    items: document.getElementById('cartItems'),
    total: document.getElementById('cartTotal'),
    drawer: document.getElementById('cartDrawer'),
    overlay: document.getElementById('cartOverlay'),
    toast: document.getElementById('toast'),
    timeSel: document.getElementById('timeSel'),
    timeLabel: document.getElementById('timeLabel'),
    timeHint: document.getElementById('timeHint'),
    addrWrap: document.getElementById('addrWrap'),
    addrInput: document.getElementById('addrInput'),
    guestsWrap: document.getElementById('guestsWrap'),
    guestsVal: document.getElementById('guestsVal'),
    phoneWrap: document.getElementById('phoneWrap'),
    phoneInput: document.getElementById('phoneInput'),
    deliveryNote: document.getElementById('deliveryNote'),
    orderBtn: document.getElementById('cartOrder'),
    orderLabel: document.getElementById('orderLabel'),
    fabCount: document.getElementById('fabCount'),
    fab: document.getElementById('fab')
  };

  function parsePrice(p){ return parseInt(String(p).replace(/\D/g,''), 10) || 0; }
  function unitOf(name){
    var m = String(name).match(/,\s*(\d+\s*(?:мл|г|гр))\s*$/i);
    return m ? m[1].replace(/\s+/g,' ') : '';
  }
  function save(){
    localStorage.setItem('kr_cart', JSON.stringify(cart));
    localStorage.setItem('kr_mode', mode);
    localStorage.setItem('kr_guests', String(guests));
  }

  // ---------- слоты времени: шаг 15 минут, не раньше минимальной задержки ----------
  function buildSlots(m){
    var wait = MIN_WAIT[m] || 60;
    var t = new Date(Date.now() + wait * 60000);
    t.setSeconds(0, 0);
    var rem = t.getMinutes() % STEP;
    if (rem !== 0) t.setMinutes(t.getMinutes() + (STEP - rem));
    var groups = [], dayNames = ['Сегодня','Завтра','Послезавтра'];
    var maxDays = (m === 'booking') ? 3 : 1;   // самовывоз и доставка — только сегодня
    for (var d = 0; d < maxDays; d++){
      var dayStart = new Date(t); dayStart.setHours(OPEN_H, 0, 0, 0);
      if (t < dayStart) t = new Date(dayStart);
      var slots = [];
      var guard = 0;
      while (t.getHours() < CLOSE_H && guard < 60){
        var hh = String(t.getHours()).padStart(2,'0');
        var mm = String(t.getMinutes()).padStart(2,'0');
        slots.push(hh + ':' + mm);
        t = new Date(t.getTime() + STEP * 60000);
        guard++;
      }
      if (slots.length) groups.push({ label: dayNames[d] || 'Позже', slots: slots });
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0, 0, 0);
    }
    return groups;
  }

  function renderTime(keep){
    var prev = keep ? els.timeSel.value : null;
    var groups = buildSlots(mode);
    var hint = { pickup: 'Самовывоз — не раньше, чем через час',
                 delivery: 'Доставка — не раньше, чем через два часа',
                 booking: 'Бронь столика — не раньше, чем через час' };
    if (!groups.length){
      els.timeSel.innerHTML = '<option value="">На сегодня слоты закончились</option>';
      els.timeSel.disabled = true;
      els.timeHint.textContent = hint[mode] + ' · кафе работает с 10:00 до 23:00';
      return;
    }
    els.timeSel.disabled = false;
    var html = '', first = null;
    groups.forEach(function(g){
      html += '<optgroup label="' + g.label + '">';
      g.slots.forEach(function(s){
        var v = g.label + ' ' + s;
        if (!first) first = v;
        html += '<option value="' + v + '">' + g.label + ', ' + s + '</option>';
      });
      html += '</optgroup>';
    });
    els.timeSel.innerHTML = html;
    if (prev){
      var still = Array.prototype.some.call(els.timeSel.options, function(o){ return o.value === prev; });
      els.timeSel.value = still ? prev : first;
    } else {
      els.timeSel.value = first;
    }
    els.timeHint.textContent = hint[mode] + ' · кафе работает с 10:00 до 23:00';
  }

  // ---------- видимость блоков по режиму ----------
  function applyMode(){
    document.querySelectorAll('#modeTabs button').forEach(function(b){
      b.classList.toggle('on', b.dataset.mode === mode);
    });
    els.addrWrap.style.display = (mode === 'delivery') ? 'flex' : 'none';
    els.guestsWrap.style.display = (mode === 'booking') ? 'flex' : 'none';
    els.phoneWrap.style.display = (mode === 'pickup' || mode === 'delivery' || mode === 'booking') ? 'flex' : 'none';
    els.deliveryNote.style.display = (mode === 'delivery') ? 'block' : 'none';
    els.timeLabel.textContent = (mode === 'booking') ? '🕐 Время брони' : '🕐 Время получения';
    els.orderLabel.textContent = (mode === 'booking') ? 'Забронировать' : 'Заказать';
    renderTime(true);
  }

  // ---------- корзина ----------
  function esc(s){ return String(s).replace(/"/g,'&quot;'); }

  function renderCart(){
    var names = Object.keys(cart), count = 0, total = 0, h = '';
    names.forEach(function(n){
      var q = cart[n].qty;
      count += q;
      total += q * cart[n].price;
      var u = cart[n].unit ? ' <span class="ci-unit">' + cart[n].unit + '</span>' : '';
      h += '<div class="cart-item">'
         +   '<div class="ci-name">' + n + u + '</div>'
         +   '<div class="ci-row"><span class="ci-sum">' + (cart[n].price * q) + ' ₽</span>'
         +   '<div class="qty">'
         +     '<button data-dec="' + esc(n) + '">−</button>'
         +     '<span>' + q + '</span>'
         +     '<button data-inc="' + esc(n) + '">+</button>'
         +   '</div></div>'
         + '</div>';
    });
    els.items.innerHTML = h || '<div class="cart-empty">' + (mode === 'booking'
      ? 'Можно просто забронировать столик — без заказа 🪑'
      : 'Пока пусто — добавьте что-нибудь из каталога 🍜') + '</div>';
    els.count.textContent = count;
    els.drawerCount.textContent = count;
    els.fabCount.textContent = count;
    els.count.style.display = count ? 'flex' : 'none';
    els.fabCount.style.display = count ? 'flex' : 'none';
    els.fab.classList.toggle('show', count > 0);
    els.total.textContent = total + ' ₽';
    save();
  }

  function addItem(name, price){
    var unit = unitOf(name);
    if (!cart[name]) cart[name] = { qty: 0, price: parsePrice(price), unit: unit };
    cart[name].qty++;
    cart[name].unit = cart[name].unit || unit;
    renderCart();
    if (els.toast){
      els.toast.textContent = 'Добавлено: ' + name;
      els.toast.classList.add('show');
      setTimeout(function(){ els.toast.classList.remove('show'); }, 1800);
    }
  }

  document.querySelectorAll('[data-ax-add]').forEach(function(b){
    b.addEventListener('click', function(){
      addItem(b.dataset.name, b.dataset.price);
    });
  });

  els.items.addEventListener('click', function(e){
    var inc = e.target.dataset.inc, dec = e.target.dataset.dec;
    if (inc){ cart[inc].qty++; renderCart(); }
    if (dec){
      cart[dec].qty--;
      if (cart[dec].qty <= 0) delete cart[dec];
      renderCart();
    }
  });

  // ---------- гости (только для брони) ----------
  function setGuests(v){
    guests = Math.min(30, Math.max(1, v));
    els.guestsVal.textContent = guests;
    save();
  }
  document.getElementById('gMinus').addEventListener('click', function(){ setGuests(guests - 1); });
  document.getElementById('gPlus').addEventListener('click', function(){ setGuests(guests + 1); });

  // ---------- вкладки режимов ----------
  document.querySelectorAll('#modeTabs button').forEach(function(b){
    b.addEventListener('click', function(){
      mode = b.dataset.mode;
      applyMode();
      renderCart();
    });
  });

  var addrInput = document.getElementById('addrInput');
  var commentInput = document.getElementById('commentInput');
  var phoneInput = document.getElementById('phoneInput');
  addrInput.addEventListener('input', function(){ localStorage.setItem('kr_addr', addrInput.value); });
  commentInput.addEventListener('input', function(){ localStorage.setItem('kr_comment', commentInput.value); });
  phoneInput.addEventListener('input', function(){
    // Только цифры и +
    var val = phoneInput.value.replace(/[^\d+]/g, '');
    phoneInput.value = val;
    localStorage.setItem('kr_phone', val);
  });
  try { addrInput.value = localStorage.getItem('kr_addr') || ''; } catch(e){}
  try { commentInput.value = localStorage.getItem('kr_comment') || ''; } catch(e){}
  try { phoneInput.value = localStorage.getItem('kr_phone') || ''; } catch(e){}

  // ---------- открытие / закрытие ----------
  function openCart(){
    els.drawer.classList.add('open');
    els.overlay.classList.add('open');
    applyMode();
    renderCart();
  }
  function closeCart(){
    els.drawer.classList.remove('open');
    els.overlay.classList.remove('open');
  }
  document.getElementById('cartBtn').addEventListener('click', openCart);
  var fab = document.getElementById('fab');
  if (fab) fab.addEventListener('click', openCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  els.overlay.addEventListener('click', closeCart);

  document.getElementById('cartClear').addEventListener('click', function(){
    cart = {};
    renderCart();
    if (els.toast){
      els.toast.textContent = 'Корзина очищена';
      els.toast.classList.add('show');
      setTimeout(function(){ els.toast.classList.remove('show'); }, 1500);
    }
  });

  // ---------- оформление ----------
  els.orderBtn.addEventListener('click', function(){
    var names = Object.keys(cart);
    var total = names.reduce(function(s, n){ return s + cart[n].price * cart[n].qty; }, 0);
    var isBooking = mode === 'booking';
    if (!isBooking && names.length === 0){
      if (els.toast){
        els.toast.textContent = 'Сначала добавьте что-нибудь из каталога';
        els.toast.classList.add('show');
        setTimeout(function(){ els.toast.classList.remove('show'); }, 1800);
      }
      return;
    }
    if (!els.timeSel.value){
      if (els.toast){
        els.toast.textContent = 'На сегодня слоты закончились — попробуйте позже';
        els.toast.classList.add('show');
        setTimeout(function(){ els.toast.classList.remove('show'); }, 2400);
      }
      return;
    }
    if (mode === 'delivery'){
      if (!addrInput.value.trim()){
        if (els.toast){
          els.toast.textContent = 'Введите адрес доставки';
          els.toast.classList.add('show');
          setTimeout(function(){ els.toast.classList.remove('show'); }, 2000);
        }
        return;
      }
    }
    if (mode === 'pickup' || mode === 'delivery' || mode === 'booking'){
      if (!phoneInput.value.trim() || phoneInput.value.replace(/\D/g, '').length < 10){
        if (els.toast){
          els.toast.textContent = 'Введите номер телефона';
          els.toast.classList.add('show');
          setTimeout(function(){ els.toast.classList.remove('show'); }, 2000);
        }
        return;
      }
    }

    // Блокируем кнопку
    els.orderBtn.disabled = true;
    els.orderBtn.style.opacity = '0.6';

    var modeName = { pickup: 'Самовывоз', delivery: 'Доставка', booking: 'Бронь столика' }[mode];
    var orderData = {
      mode: mode,
      time: els.timeSel.value,
      guests: guests,
      address: addrInput.value.trim(),
      phone: phoneInput.value.trim(),
      items: names.map(function(n){
        return { name: n, qty: cart[n].qty, price: cart[n].price };
      }),
      comment: commentInput.value.trim(),
      total: total
    };

    fetch(API_URL + '/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    })
    .then(function(r){ return r.json(); })
    .then(function(resp){
      if (resp.ok){
        if (els.toast){
          els.toast.textContent = isBooking ? 'Бронь оформлена! ✓' : 'Заказ отправлен! Мы скоро свяжемся с вами ✓';
          els.toast.classList.add('show');
          setTimeout(function(){ els.toast.classList.remove('show'); }, 3000);
        }
        if (!isBooking){ cart = {}; renderCart(); }
      } else {
        if (els.toast){
          els.toast.textContent = 'Ошибка отправки — попробуйте позже или напишите нам';
          els.toast.classList.add('show');
          setTimeout(function(){ els.toast.classList.remove('show'); }, 3000);
        }
      }
    })
    .catch(function(){
      if (els.toast){
        els.toast.textContent = 'Ошибка сети — попробуйте позже или напишите нам';
        els.toast.classList.add('show');
        setTimeout(function(){ els.toast.classList.remove('show'); }, 3000);
      }
    })
    .finally(function(){
      els.orderBtn.disabled = false;
      els.orderBtn.style.opacity = '1';
    });
  });

  // слоты времени обновляются раз в минуту, пока панель открыта
  setInterval(function(){
    if (els.drawer.classList.contains('open')) renderTime(true);
  }, 60000);

  // ---------- прочее ----------
  var scrollTopBtn = document.getElementById('scrollTop');
  window.addEventListener('scroll', function(){
    if (scrollTopBtn){
      scrollTopBtn.classList.toggle('show', window.scrollY > 600);
    }
  });
  if (scrollTopBtn){
    scrollTopBtn.addEventListener('click', function(){
      document.getElementById('catalog').scrollIntoView({behavior:'smooth'});
    });
  }

  document.getElementById('burger').addEventListener('click', function(){
    document.getElementById('menu').classList.toggle('open');
  });
  document.querySelectorAll('#menu a').forEach(function(a){
    a.addEventListener('click', function(){ document.getElementById('menu').classList.remove('open'); });
  });

  // ---------- раскрытие описаний по клику на карточку ----------
  document.querySelectorAll('.tile').forEach(function(tile){
    var desc = tile.querySelector('.tile-desc');
    if (!desc) return;
    var toggle = document.createElement('div');
    toggle.className = 'tile-desc-toggle';
    toggle.textContent = 'Подробнее';
    tile.appendChild(toggle);
    tile.addEventListener('click', function(e){
      desc.classList.toggle('open');
      tile.classList.toggle('expanded');
      toggle.textContent = desc.classList.contains('open') ? 'Скрыть' : 'Подробнее';
    });
  });

  els.guestsVal.textContent = guests;
  applyMode();
  renderCart();
})();