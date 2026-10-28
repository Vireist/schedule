/* Публичный календарь расписания Vireist */
(function () {
    'use strict';

    const MONTHS = ['ЯНВАРЬ','ФЕВРАЛЬ','МАРТ','АПРЕЛЬ','МАЙ','ИЮНЬ','ИЮЛЬ','АВГУСТ','СЕНТЯБРЬ','ОКТЯБРЬ','НОЯБРЬ','ДЕКАБРЬ'];
    const MONTH_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
    const WEEKDAYS = ['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'];
    const WD_GET = ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];

    const $ = (id) => document.getElementById(id);
    const state = { data: null, months: [], mi: 0, sel: null };

    function esc(s) {
        return String(s == null ? '' : s)
            .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    }
    function parseISO(s) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return null;
        const [y, m, d] = s.split('-').map(Number);
        return { y, m, d, date: new Date(y, m - 1, d) };
    }
    function plural(n, one, few, many) {
        n = Math.abs(n) % 100;
        const n1 = n % 10;
        if (n > 10 && n < 20) return many;
        if (n1 > 1 && n1 < 5) return few;
        if (n1 === 1) return one;
        return many;
    }
    function todayISO() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function durText(h) {
        if (!h) return '';
        return h + '\u00A0' + plural(h, 'час', 'часа', 'часов');
    }

    /* ---------- тема ---------- */
    function setTheme(name) {
        document.documentElement.setAttribute('data-theme', name);
        try { localStorage.setItem('vsched-theme', name); } catch (e) {}
        $('theme-btn').textContent = name === 'light' ? '☀' : '☾';
    }
    function initTheme() {
        let saved = null;
        try { saved = localStorage.getItem('vsched-theme'); } catch (e) {}
        setTheme(saved || 'dark');
        $('theme-btn').addEventListener('click', () => {
            setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
        });
    }

    /* ---------- данные ---------- */
    let toastTimer = null;
    function toast(msg, isErr) {
        let t = $('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.className = 'toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.toggle('err', !!isErr);
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 7000 : 4500);
    }

    function load() {
        fetch('data/config.json?ts=' + Date.now(), { cache: 'no-store' })
            .then((r) => { if (!r.ok) throw new Error('config.json: HTTP ' + r.status); return r.json(); })
            .then((cfg) => {
                const list = [...(cfg.months || [])]
                    .filter((m) => /^\d{4}-\d{2}$/.test(String(m)))
                    .sort();
                if (!list.length) throw new Error('в data/config.json пустой список months');
                return Promise.allSettled(list.map((m) =>
                    fetch('data/' + m + '.json?ts=' + Date.now(), { cache: 'no-store' })
                        .then((r) => { if (!r.ok) throw new Error(m + ': HTTP ' + r.status); return r.json(); })
                        .then((j) => ({ m, j }))
                )).then((res) => {
                    const missing = [];
                    const games = [];
                    res.forEach((r, i) => {
                        if (r.status === 'fulfilled') {
                            if (r.value.j.month && r.value.j.month !== list[i]) {
                                console.warn('Поле month в файле ' + list[i] + '.json не совпадает с именем файла.');
                            }
                            (r.value.j.games || []).forEach((g) => games.push(g));
                        } else {
                            missing.push(list[i]);
                        }
                    });
                    init({ brand: cfg.brand, note: cfg.note, games });
                    if (missing.length) {
                        toast('Не найдены файлы месяцев: ' + missing.map((m) => 'data/' + m + '.json').join(', ') + ' — проверьте реестр в config.json', true);
                    }
                });
            })
            .catch((e) => {
                $('cal-block').innerHTML = '<div class="load-error">Не удалось загрузить расписание (<b>' + esc(e.message) +
                    '</b>).<br>Если вы владелец сайта — проверьте data/config.json и папку data/ в репозитории.</div>';
            });
    }

    function init(raw) {
        const data = Object.assign({}, raw || {});
        data.brand = Object.assign(
            { name: 'VIREIST', tagline: 'НРИ • хоррор и драма', channel: '@vireist_nri', site: 'vireist.ru', tg: '' },
            data.brand || {}
        );
        data.games = [...(data.games || [])]
            .map((g) => Object.assign({}, g, { _p: parseISO(g.date) }))
            .filter((g) => g._p)
            .sort((a, b) => (a.date < b.date ? -1 : 1));

        state.data = data;

        const map = new Map();
        data.games.forEach((g) => {
            const key = g._p.y + '-' + String(g._p.m).padStart(2, '0');
            if (!map.has(key)) map.set(key, { y: g._p.y, m: g._p.m });
        });
        state.months = [...map.values()];
        if (!state.months.length) {
            $('cal-block').innerHTML = '<div class="load-error">В расписании пока нет игр.<br>Добавьте файлы месяцев в папку data/ и пропишите их в списке months в data/config.json.</div>';
            return;
        }

        $('brand-overline').textContent = data.brand.name + ' • ' + data.brand.tagline;
        if (raw.note) {
            const pn = document.querySelector('.page-note');
            if (pn) pn.textContent = raw.note;
        }

        const t = todayISO();
        const idx = state.months.findIndex((mo) =>
            data.games.some((g) => g._p.y === mo.y && g._p.m === mo.m && g.date >= t));
        state.mi = idx >= 0 ? idx : state.months.length - 1;
        state.sel = null;

        $('cal-prev').addEventListener('click', () => { if (state.mi > 0) { state.mi--; state.sel = null; render(); } });
        $('cal-next').addEventListener('click', () => { if (state.mi < state.months.length - 1) { state.mi++; state.sel = null; render(); } });

        render();
    }

    function monthGames(mo) {
        return state.data.games.filter((g) => g._p.y === mo.y && g._p.m === mo.m);
    }
    function gamesOn(mo, d) {
        return monthGames(mo).filter((g) => g._p.d === d);
    }

    /* ---------- статусы ---------- */
    function statusOf(g, played) {
        if (played) return { cls: 'played', label: 'игра прошла' };
        if (typeof g.seatsLeft === 'number' && g.seatsLeft <= 0) return { cls: 'full', label: 'мест нет' };
        const s = String(g.status || '').toLowerCase();
        if (!s) return { cls: 'open', label: 'набор открыт' };
        if (/собран/.test(s)) return { cls: 'soon', label: g.status };
        if (/нет мест|закрыт/.test(s)) return { cls: 'full', label: g.status };
        return { cls: 'open', label: g.status };
    }

    function isFest(g) {
        return g.free === true || !!g.event || /бесплат/i.test(String(g.price || ''));
    }

    /* ---------- баннер фестивалей ---------- */
    function renderFest(mo) {
        const box = $('fest-banner');
        if (!box) return;
        const monthGames = mo ? state.data.games.filter((g) => g._p.y === mo.y && g._p.m === mo.m) : state.data.games;
        const list = monthGames.filter((g) => isFest(g) && g.date >= todayISO());
        if (!list.length) { box.hidden = true; return; }
        box.hidden = false;
        $('fest-title').textContent = (list[0].event || 'Фестиваль') + ': вход по записи';
        $('fest-note').textContent = 'Бесплатные игры на фестивале. Регистрация обязательна — места ограничены: напишите в Telegram, и я забронирую слот.';
        $('fest-list').innerHTML = list.map((g) => {
            const p = g._p;
            return '<div class="fest-row"><b>' + p.d + ' ' + MONTH_SHORT[p.m - 1] + '</b>'
                + '<span>' + esc(g.time || '') + '\u00A0МСК</span>'
                + '<span>' + esc(g.name) + '</span>'
                + '<span class="free">бесплатно</span></div>';
        }).join('');
    }

    function renderLegend(mo) {
        const el = $('cal-legend');
        if (!el) return;
        if (!mo) { el.innerHTML = ''; return; }
        const gs = monthGames(mo);
        const t = todayISO();
        const hasFest = gs.some(isFest);
        const hasPlayed = gs.some((g) => g.date < t);
        const hasGame = gs.length > 0;
        let h = '';
        if (hasGame) h += '<span class="l-game"><i></i>игра</span>';
        if (hasFest) h += '<span class="l-fest"><i></i>фестиваль · вход по записи</span>';
        if (hasPlayed) h += '<span class="l-played"><i></i>прошло</span>';
        el.innerHTML = h;
    }

    /* ---------- календарь ---------- */
    function render() {
        const mo = state.months[state.mi];
        const gs = monthGames(mo);
        const t = todayISO();

        $('cal-title').textContent = MONTHS[mo.m - 1] + ' ' + mo.y;
        $('cal-count').textContent = gs.length + ' ' + plural(gs.length, 'игра', 'игры', 'игр');
        $('cal-prev').disabled = state.mi === 0;
        $('cal-next').disabled = state.mi === state.months.length - 1;

        $('cal-week').innerHTML = WEEKDAYS.map((w, i) => '<span class="' + (i >= 5 ? 'we' : '') + '">' + w + '</span>').join('');

        const first = new Date(mo.y, mo.m - 1, 1);
        const offset = (first.getDay() + 6) % 7;
        const days = new Date(mo.y, mo.m, 0).getDate();
        const trail = (7 - ((offset + days) % 7)) % 7;

        let h = '';
        for (let i = 0; i < offset; i++) h += '<div class="cal-cell out"></div>';

        for (let d = 1; d <= days; d++) {
            const col = (offset + d - 1) % 7;
            const iso = mo.y + '-' + String(mo.m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            const list = gamesOn(mo, d);
            const played = iso < t;
            const cls = ['cal-cell'];
            if (col >= 5) cls.push('we');
            if (iso === t) cls.push('today');
            if (played) cls.push('past');
            if (list.length) cls.push('has');
            if (state.sel === iso) cls.push('sel');

            h += '<div class="' + cls.join(' ') + '"' + (list.length ? ' data-date="' + iso + '" role="button" tabindex="0" aria-label="Игры ' + d + ' ' + MONTH_SHORT[mo.m - 1] + '"' : '') + '>';
            h += '<span class="d">' + d + '</span>';
            if (list.length) {
                const allPlayed = list.every((g) => g.date < t);
                const fest = list.some(isFest);
                h += '<span class="marks"><span class="mark' + (allPlayed ? ' played' : '') + (fest ? ' fest' : '') + '"></span>'
                    + (list.length > 1 ? '<span class="cnt' + (allPlayed ? ' played' : '') + '">×' + list.length + '</span>' : '')
                    + '</span>';
            }
            h += '</div>';
        }
        for (let i = 0; i < trail; i++) h += '<div class="cal-cell out"></div>';
        $('cal-grid').innerHTML = h;

        $('cal-grid').querySelectorAll('.cal-cell.has').forEach((cell) => {
            const open = () => { state.sel = cell.dataset.date; render(); };
            cell.addEventListener('click', open);
            cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
        });

        renderList(mo);
        renderFest(mo);
        renderLegend(mo);
    }

    /* ---------- список игр дня ---------- */
    function defaultDate(mo) {
        const t = todayISO();
        const upcoming = monthGames(mo).find((g) => g.date >= t);
        if (upcoming) return upcoming.date;
        const first = monthGames(mo)[0];
        return first ? first.date : null;
    }

    function tgLink(g) {
        const tg = state.data.brand.tg;
        if (!tg) return '';
        const p = g._p;
        const text = 'Здравствуйте! Хочу записаться на игру «' + g.name + '» (' + p.d + ' ' + MONTH_SHORT[p.m - 1] + ', ' + (g.time || 'время уточняется') + ' МСК).';
        return 'https://t.me/' + tg.replace(/^@/, '') + '?text=' + encodeURIComponent(text);
    }

    function card(g) {
        const played = g.date < todayISO();
        const st = statusOf(g, played);
        const url = g.url || '';
        const fest = isFest(g);

        let h = '<article class="game-card' + (played ? ' played' : '') + (fest ? ' fest' : '') + '"' + (url && !played ? ' data-url="' + esc(url) + '"' : '') + '>';
        if (fest) h += '<span class="fest-flag">' + esc(g.event || 'ФЕСТИВАЛЬ • ВХОД ПО ЗАПИСИ') + '</span>';
        h += '<div class="gc-cover"><div class="cover' + (g.cover ? '' : ' empty') + '">'
            + (g.cover ? '<img src="' + esc(g.cover) + '" alt="">' : '') + '</div></div>';
        h += '<div class="gc-body">';
        h += '<div class="gc-top">'
            + (g.case ? '<span class="case-num">дело ' + esc(g.case) + '</span>' : '')
            + '<span class="status ' + st.cls + '">' + esc(st.label) + '</span>'
            + (typeof g.seatsLeft === 'number' && g.seatsLeft > 0 && !played ? '<span class="seats">мест: ' + g.seatsLeft + '</span>' : '')
            + '</div>';
        h += '<h4 class="gc-title">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(g.name) + '</a>' : esc(g.name)) + '</h4>';
        const meta = [
            g.time ? g.time + '\u00A0МСК' : null,
            g.format,
            g.system ? '<span class="sys">' + esc(g.system) + '</span>' : null,
            g.durationHours ? durText(g.durationHours) : null,
            g.age ? '<span class="warn">' + esc(g.age) + '</span>' : null
        ].filter(Boolean).join(' • ');
        h += '<div class="gc-meta">' + meta + '</div>';
        if (g.description) h += '<p class="gc-desc">' + esc(g.description) + '</p>';
        h += '<div class="gc-foot"><div class="gc-actions">';
        if (url) h += '<a class="btn ghost" href="' + esc(url) + '" target="_blank" rel="noopener">Дело на сайте</a>';
        const tg = tgLink(g);
        if (tg && !played) h += '<a class="btn" href="' + esc(tg) + '" target="_blank" rel="noopener">Записаться в Telegram</a>';
        h += '</div>' + (fest ? '<span class="price free">вход по записи</span>' : (g.price ? '<span class="price">' + esc(g.price) + '</span>' : '')) + '</div>';
        h += '</div></article>';
        return h;
    }

    function renderList(mo) {
        const iso = state.sel || defaultDate(mo);
        const box = $('day-list');
        if (!iso) { box.hidden = true; return; }
        const p = parseISO(iso);
        const list = gamesOn(mo, p.d);
        if (!list.length) { box.hidden = true; return; }

        box.hidden = false;
        $('day-list-title').textContent = 'Игры ' + p.d + ' ' + MONTH_SHORT[p.m - 1];
        $('day-list-note').textContent = WD_GET[new Date(p.y, p.m - 1, p.d).getDay()] + ' • ' + list.length + ' ' + plural(list.length, 'игра', 'игры', 'игр');
        $('day-list-body').innerHTML = list.map(card).join('');

        $('day-list-body').querySelectorAll('.game-card[data-url]').forEach((el) => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('a,button')) return;
                window.open(el.dataset.url, '_blank', 'noopener');
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        load();
    });
})();