(function () {
  'use strict';

  var rail = document.getElementById('featureRail');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.feature-card'));
  var indexLabel = document.getElementById('featureIndex');
  var currentFeature = 0;

  function scrollToSection(id) {
    var section = document.getElementById(id);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showFeature(index) {
    currentFeature = (index + cards.length) % cards.length;
    cards[currentFeature].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    cards.forEach(function (card, cardIndex) {
      card.classList.toggle('is-current', cardIndex === currentFeature);
    });
    indexLabel.textContent = String(currentFeature + 1).padStart(2, '0');
  }

  document.getElementById('enterButton').addEventListener('click', function () {
    scrollToSection('journey');
  });
  document.getElementById('backToTop').addEventListener('click', function () {
    scrollToSection('home');
  });
  document.getElementById('previousFeature').addEventListener('click', function () {
    showFeature(currentFeature - 1);
  });
  document.getElementById('nextFeature').addEventListener('click', function () {
    showFeature(currentFeature + 1);
  });

  var railTimer = 0;
  rail.addEventListener('scroll', function () {
    window.clearTimeout(railTimer);
    railTimer = window.setTimeout(function () {
      var railCenter = rail.getBoundingClientRect().left + rail.clientWidth / 2;
      var nearest = 0;
      var nearestDistance = Infinity;
      cards.forEach(function (card, index) {
        var rect = card.getBoundingClientRect();
        var distance = Math.abs(rect.left + rect.width / 2 - railCenter);
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      });
      currentFeature = nearest;
      indexLabel.textContent = String(nearest + 1).padStart(2, '0');
    }, 80);
  }, { passive: true });

  var selections = { craft: '扎染', carrier: '帆布包', mood: '山海国潮' };
  var storyFragments = {
    '扎染': '让蓝白晕染化作流动的云与潮汐',
    '剪纸': '让一张红纸剪出层层相连的当代故事',
    '苗绣': '让彩线与几何纹样继续讲述穿在身上的史诗',
    '木雕': '让木纹沿着刀锋醒来，留下温润的手作痕迹'
  };
  var carrierFragments = {
    '帆布包': '在每一次日常出行中被看见',
    '手机壳': '成为随身携带的一小块东方纹样',
    '拼豆挂件': '变成能够亲手完成的像素作品',
    '茶具': '在一盏一饮之间回到当代生活'
  };

  Array.prototype.slice.call(document.querySelectorAll('.choice-group')).forEach(function (group) {
    group.addEventListener('click', function (event) {
      var button = event.target.closest('.choice');
      if (!button || !group.contains(button)) return;
      Array.prototype.slice.call(group.querySelectorAll('.choice')).forEach(function (choice) {
        choice.classList.toggle('is-selected', choice === button);
      });
      selections[group.getAttribute('data-group')] = button.getAttribute('data-value');
    });
  });

  function nextTicketNumber() {
    var stored = Number(window.localStorage.getItem('heritage-ticket-number') || '0');
    var next = stored >= 999 ? 1 : stored + 1;
    window.localStorage.setItem('heritage-ticket-number', String(next));
    return String(next).padStart(3, '0');
  }

  document.getElementById('forgeButton').addEventListener('click', function () {
    var ticket = document.getElementById('creationTicket');
    document.getElementById('ticketNumber').textContent = nextTicketNumber();
    document.getElementById('ticketTitle').textContent = selections.craft + selections.mood + selections.carrier;
    document.getElementById('ticketStory').textContent = storyFragments[selections.craft] + '，' + carrierFragments[selections.carrier] + '。';
    document.getElementById('ticketCraft').textContent = selections.craft;
    document.getElementById('ticketCarrier').textContent = selections.carrier;
    document.getElementById('ticketMood').textContent = selections.mood;
    ticket.classList.remove('is-fresh');
    window.requestAnimationFrame(function () {
      ticket.classList.add('is-fresh');
      ticket.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  var navDots = Array.prototype.slice.call(document.querySelectorAll('.nav-dot'));
  navDots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      scrollToSection(dot.getAttribute('data-target'));
    });
  });

  var sections = navDots.map(function (dot) {
    return document.getElementById(dot.getAttribute('data-target'));
  });
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var activeIndex = sections.indexOf(entry.target);
      navDots.forEach(function (dot, index) {
        dot.classList.toggle('is-active', index === activeIndex);
      });
    });
  }, { threshold: 0.52 });
  sections.forEach(function (section) { observer.observe(section); });
}());
