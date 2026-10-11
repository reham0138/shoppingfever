"use strict";

/* ========== Helpers ========== */
const API = "https://dummyjson.com";
const $ = (id) => document.getElementById(id);
const money = (n) => "$" + Number(n).toFixed(2);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// localStorage wrapper (safe against corrupted data)
const store = {
    get(key, fallback) {
        try {
            const v = JSON.parse(localStorage.getItem(key));
            return v ?? fallback;
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/blocked */ }
    },
};

// always returns an array, even if localStorage holds something unexpected
const list = (key) => {
    const v = store.get(key, []);
    return Array.isArray(v) ? v : [];
};

// broken image -> neutral placeholder
const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#eee"/><text x="50%" y="50%" fill="#999" font-family="Arial" font-size="14" text-anchor="middle">No image</text></svg>');
document.addEventListener("error", (e) => {
    const t = e.target;
    if (t.tagName === "IMG" && !t.dataset.failed) { t.dataset.failed = "1"; t.src = PLACEHOLDER; }
}, true);

// DummyJSON -> the product shape used across the app
const normalize = (p) => ({
    id: p.id,
    title: p.title,
    price: p.price,
    image: p.thumbnail,
    category: p.category,
    description: p.description,
    rating: { rate: Number(p.rating).toFixed(1), count: p.reviews ? p.reviews.length : 0 },
});

async function api(path) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000); // don't hang forever
    let res;
    try { res = await fetch(API + path, { signal: ctl.signal }); }
    finally { clearTimeout(timer); }
    if (res.status === 404) return null; // unknown product id
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
}
const getProducts = async () => (await api("/products?limit=0")).products.map(normalize);
const getCategories = async () => api("/products/category-list");
const getProduct = async (id) => {
    const p = await api("/products/" + id);
    return p ? normalize(p) : null;
};

const known = {}; // id -> product (filled when products are rendered)
const remember = (list) => list.forEach((p) => (known[p.id] = p));

function flash(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 900);
}

/* ========== Theme ========== */
function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    const b = $("theme-btn");
    if (b) b.textContent = t === "dark" ? "Light mode" : "Dark mode";
}
function initTheme() {
    const saved = store.get("theme", null);
    applyTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    $("theme-btn")?.addEventListener("click", () => {
        const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        store.set("theme", t);
        applyTheme(t);
    });
}

/* ========== Favorites ========== */
const getFavs = () => list("favorites").filter(Number.isInteger);
function refreshFavs() {
    const favs = getFavs();
    document.querySelectorAll("[data-fav]").forEach((b) => {
        const on = favs.includes(+b.dataset.fav);
        b.classList.toggle("active", on);
        b.textContent = (on ? "♥" : "♡") + (b.dataset.label ? " " + b.dataset.label : "");
    });
}
function toggleFav(id) {
    const f = getFavs();
    store.set("favorites", f.includes(id) ? f.filter((x) => x !== id) : [...f, id]);
    refreshFavs();
    document.dispatchEvent(new Event("favchange"));
}

/* ========== Cart ========== */
const getCart = () =>
    list("cart")
        .filter((i) => i && Number.isInteger(i.id) && Number.isFinite(+i.price) && +i.price >= 0 && Number.isInteger(i.qty) && i.qty >= 1)
        .map((i) => ({ ...i, price: +i.price, qty: Math.min(99, i.qty) }));
const cartTotal = (c) => c.reduce((s, i) => s + i.price * i.qty, 0);
function updateBadge() {
    const n = getCart().reduce((s, i) => s + i.qty, 0);
    const a = document.querySelector('.links a[href="cart.html"]');
    if (a) a.textContent = n ? `Cart (${n})` : "Cart";
}
function saveCart(c) {
    store.set("cart", c);
    updateBadge();
}
function addToCart(p, qty = 1) {
    const c = getCart();
    const item = c.find((x) => x.id === p.id);
    if (item) item.qty = Math.min(99, item.qty + qty);
    else c.push({ id: p.id, title: p.title, price: p.price, image: p.image, qty });
    saveCart(c);
}

/* ========== Product card ========== */
function card(p) {
    return `<article class="product-card">
        <button class="fav-btn" data-fav="${p.id}" aria-label="Toggle favorite">♡</button>
        <a href="product-details.html?id=${p.id}"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy"></a>
        <div class="product-info">
            <h3 class="product-title">${esc(p.title)}</h3>
            <p class="product-price">${money(p.price)}</p>
            <button class="product-btn" data-add="${p.id}">Add to cart</button>
        </div>
    </article>`;
}

// One click listener for favorite / add-to-cart buttons on any page
document.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) return toggleFav(+fav.dataset.fav);
    const add = e.target.closest("[data-add]");
    if (add && known[+add.dataset.add]) {
        addToCart(known[+add.dataset.add]);
        flash(add, "Added ✓");
    }
});

/* ========== Home ========== */
const getHistory = () => list("history").filter((q) => typeof q === "string");
function renderHistory() {
    const h = getHistory();
    $("historyList").innerHTML = h.length
        ? h.map((q) => `<button class="history-item" data-q="${esc(q)}">${esc(q)}</button>`).join("")
        : '<p class="muted">Your searches will appear here.</p>';
}
async function initHome() {
    renderHistory();
    const go = () => {
        const q = $("searchInput").value.trim().slice(0, 100);
        if (!q) return $("searchInput").focus(); // empty search: do nothing
        store.set("history", [q, ...getHistory().filter((x) => x !== q)].slice(0, 8));
        location.href = "products.html?q=" + encodeURIComponent(q);
    };
    $("searchBtn").addEventListener("click", go);
    $("searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    $("clearHistory").addEventListener("click", () => { store.set("history", []); renderHistory(); });
    $("historyList").addEventListener("click", (e) => {
        const b = e.target.closest("[data-q]");
        if (b) location.href = "products.html?q=" + encodeURIComponent(b.dataset.q);
    });
    try {
        const list = await getProducts();
        remember(list);
        const top = [...list].sort((a, b) => (b.rating.rate) - (a.rating.rate)).slice(0, 4);
        $("featuredProducts").innerHTML = top.map(card).join("");
        refreshFavs();
    } catch {
        $("featuredError").hidden = false;
    } finally {
        $("featuredLoading").hidden = true;
    }
}

/* ========== Products ========== */
const PER_PAGE = 6;

// e.g. [1, "…", 4, 5, 6, "…", 33]
function pageList(cur, total) {
    const nums = [...new Set([1, total, cur - 1, cur, cur + 1])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    nums.forEach((n, i) => {
        if (i && n - nums[i - 1] > 1) out.push("…");
        out.push(n);
    });
    return out;
}

async function initProducts() {
    const params = new URLSearchParams(location.search);
    const st = {
        q: (params.get("q") || "").slice(0, 100),
        cat: "all",
        sort: "default",
        fav: false,
        page: Math.max(1, parseInt(params.get("page")) || 1),
    };
    $("filterInput").value = st.q;
    let all = [];

    const render = () => {
        const q = st.q.trim().toLowerCase();
        const favs = getFavs();
        const r = all.filter(
            (p) =>
                (st.cat === "all" || p.category === st.cat) &&
                (!q || (p.title + " " + p.category).toLowerCase().includes(q)) &&
                (!st.fav || favs.includes(p.id))
        );
        if (st.sort === "price-asc") r.sort((a, b) => a.price - b.price);
        if (st.sort === "price-desc") r.sort((a, b) => b.price - a.price);

        const pages = Math.max(1, Math.ceil(r.length / PER_PAGE));
        st.page = Math.min(Math.max(1, st.page), pages); // invalid ?page= values are corrected
        const start = (st.page - 1) * PER_PAGE;
        const shown = r.slice(start, start + PER_PAGE);

        $("productGrid").innerHTML = shown.map(card).join("");
        $("resultCount").textContent = r.length ? `Showing ${start + 1}–${start + shown.length} of ${r.length} products` : "0 products";
        $("emptyState").hidden = r.length > 0;
        $("pagination").innerHTML = pages > 1
            ? `<button class="page-btn" data-page="${st.page - 1}" ${st.page === 1 ? "disabled" : ""}>← Prev</button>` +
              pageList(st.page, pages).map((n) => n === "…"
                  ? '<span class="page-gap">…</span>'
                  : `<button class="page-btn${n === st.page ? " active" : ""}" data-page="${n}" ${n === st.page ? 'aria-current="page"' : ""}>${n}</button>`).join("") +
              `<button class="page-btn" data-page="${st.page + 1}" ${st.page === pages ? "disabled" : ""}>Next →</button>`
            : "";
        refreshFavs();
        try {
            const u = new URL(location.href);
            if (st.page > 1) u.searchParams.set("page", st.page); else u.searchParams.delete("page");
            history.replaceState(null, "", u);
        } catch { /* some browsers block this on file:// */ }
    };

    try {
        const [prods, cats] = await Promise.all([getProducts(), getCategories()]);
        all = prods;
        remember(prods);
        cats.forEach((c) => $("categorySelect").insertAdjacentHTML("beforeend", `<option value="${esc(c)}">${esc(cap(c))}</option>`));
    } catch {
        $("productsLoading").hidden = true;
        $("productsError").hidden = false;
        $("resultCount").textContent = "0 products";
        return;
    }
    $("productsLoading").hidden = true;
    render();

    // any filter change goes back to page 1
    $("filterInput").addEventListener("input", (e) => { st.q = e.target.value.slice(0, 100); st.page = 1; render(); });
    $("categorySelect").addEventListener("change", (e) => { st.cat = e.target.value; st.page = 1; render(); });
    $("sortSelect").addEventListener("change", (e) => { st.sort = e.target.value; st.page = 1; render(); });
    $("favToggle").addEventListener("click", (e) => { st.fav = !st.fav; st.page = 1; e.currentTarget.classList.toggle("active", st.fav); render(); });
    document.addEventListener("favchange", () => { if (st.fav) render(); });
    $("pagination").addEventListener("click", (e) => {
        const b = e.target.closest("[data-page]");
        if (!b || b.disabled) return;
        st.page = +b.dataset.page;
        render();
        $("productGrid").scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

/* ========== Product details ========== */
async function initDetails() {
    const id = Number(new URLSearchParams(location.search).get("id"));
    const err = $("detailsError");
    try {
        if (!Number.isInteger(id) || id < 1) throw new Error("notfound");
        const p = await getProduct(id);
        if (!p) throw new Error("notfound");
        remember([p]);
        $("productDetails").innerHTML = `
            <img src="${esc(p.image)}" alt="${esc(p.title)}">
            <div class="details-info">
                <p class="desc">${esc(p.category.toUpperCase())}</p>
                <h2>${esc(p.title)}</h2>
                <p class="rating">★ ${p.rating?.rate ?? "-"} (${p.rating?.count ?? 0} reviews)</p>
                <p class="product-price">${money(p.price)}</p>
                <p class="details-text">${esc(p.description)}</p>
                <div class="qty-row"><label for="qtyInput">Quantity</label>
                    <input type="number" id="qtyInput" min="1" max="99" value="1"></div>
                <div class="details-actions">
                    <button class="product-btn" id="detailAdd">Add to cart</button>
                    <button class="product-btn secondary" data-fav="${p.id}" data-label="Favorite"></button>
                </div>
            </div>`;
        $("productDetails").hidden = false;
        refreshFavs();
        $("detailAdd").addEventListener("click", (e) => {
            const qty = Math.max(1, Math.min(99, parseInt($("qtyInput").value) || 1));
            $("qtyInput").value = qty; // show the corrected value
            addToCart(p, qty);
            flash(e.currentTarget, "Added ✓");
        });
    } catch (e) {
        err.textContent = e.message === "notfound" ? "Product not found." : "Failed to load product.";
        err.hidden = false;
    } finally {
        $("detailsLoading").hidden = true;
    }
}

/* ========== Cart page ========== */
function initCart() {
    const render = () => {
        const c = getCart();
        $("cartEmpty").hidden = c.length > 0;
        $("cartContent").hidden = c.length === 0;
        $("cartItems").innerHTML = c.map((i) => `
            <div class="cart-item">
                <img src="${esc(i.image)}" alt="">
                <div class="cart-info">
                    <a href="product-details.html?id=${i.id}" class="product-title">${esc(i.title)}</a>
                    <span class="product-price">${money(i.price)}</span>
                </div>
                <div class="qty-ctrl">
                    <button data-qty="${i.id}" data-d="-1" aria-label="Decrease">−</button>
                    <span>${i.qty}</span>
                    <button data-qty="${i.id}" data-d="1" aria-label="Increase">+</button>
                </div>
                <strong class="line-total">${money(i.price * i.qty)}</strong>
                <button class="remove-btn" data-remove="${i.id}" aria-label="Remove">✕</button>
            </div>`).join("");
        $("cartTotal").textContent = money(cartTotal(c));
    };
    $("cartItems").addEventListener("click", (e) => {
        const q = e.target.closest("[data-qty]");
        const r = e.target.closest("[data-remove]");
        let c = getCart();
        if (q) {
            const item = c.find((x) => x.id === +q.dataset.qty);
            if (item) item.qty = Math.max(1, Math.min(99, item.qty + +q.dataset.d));
        } else if (r) {
            c = c.filter((x) => x.id !== +r.dataset.remove);
        } else return;
        saveCart(c);
        render();
    });
    $("clearCart").addEventListener("click", () => {
        if (getCart().length && confirm("Remove all items from your cart?")) { saveCart([]); render(); }
    });
    render();
}

/* ========== Orders (shared) ========== */
const ORDER_STEPS = ["Processing", "Shipped", "Delivered"];
const getOrders = () => list("orders").filter((o) => o && o.id && o.customer && Array.isArray(o.items));
// Simulated status based on order time: <2 min Processing, <5 min Shipped, then Delivered
function orderStatus(o) {
    if (o.cancelled) return "Cancelled";
    const mins = (Date.now() - (Number(o.createdAt) || 0)) / 60000;
    return mins < 2 ? "Processing" : mins < 5 ? "Shipped" : "Delivered";
}

/* ========== Orders page ========== */
function initOrders() {
    const st = { filter: "all" };
    const render = () => {
        const all = getOrders();
        const o = all.filter((x) => st.filter === "all" || orderStatus(x) === st.filter);
        $("ordersEmpty").hidden = o.length > 0;
        $("ordersEmpty").innerHTML = all.length
            ? "No orders with this status."
            : 'No orders yet. <a class="back-link" href="products.html">Browse products</a>';
        $("ordersList").innerHTML = o.map((x) => {
            const s = orderStatus(x);
            const idx = ORDER_STEPS.indexOf(s);
            const tracker = s === "Cancelled" ? "" :
                `<ol class="tracker">${ORDER_STEPS.map((t, i) => `<li class="${i <= idx ? "done" : ""}">${t}</li>`).join("")}</ol>`;
            const cancel = s === "Processing" ? `<button class="clear-btn" data-cancel="${esc(x.id)}">Cancel order</button>` : "";
            return `<article class="order-card">
                <div class="order-head">
                    <strong>#${esc(x.id)}</strong>
                    <span class="muted">${esc(x.date)}</span>
                    <span class="status ${s.toLowerCase()}">${s}</span>
                    <strong class="product-price">${money(x.total)}</strong>
                </div>
                ${tracker}
                <p class="muted">${esc(x.customer.name)} — ${esc(x.customer.address)}, ${esc(x.customer.city)} (${esc(x.customer.payment)})</p>
                <ul class="order-items">${x.items.map((i) => `<li>${esc(i.title)} × ${esc(i.qty)}</li>`).join("")}</ul>
                ${x.cancelledAt ? `<p class="muted">Cancelled on ${esc(x.cancelledAt)}</p>` : ""}
                ${cancel ? `<div class="order-actions">${cancel}</div>` : ""}
            </article>`;
        }).join("");
    };

    $("ordersList").addEventListener("click", (e) => {
        const b = e.target.closest("[data-cancel]");
        if (!b) return;
        const orders = getOrders();
        const o = orders.find((x) => String(x.id) === b.dataset.cancel);
        if (!o) return render();
        if (orderStatus(o) !== "Processing") { // status may have changed while the page was open
            alert("Sorry, this order has already been shipped and can't be cancelled.");
            return render();
        }
        if (!confirm(`Cancel order #${o.id}?`)) return;
        o.cancelled = true;
        o.cancelledAt = new Date().toLocaleString();
        store.set("orders", orders);
        render();
    });
    $("ordersFilter").addEventListener("change", (e) => { st.filter = e.target.value; render(); });
    setInterval(render, 15000); // keep statuses fresh
    render();
}

/* ========== Checkout ========== */
const PAYMENTS = ["Cash on delivery", "Credit card (simulated)"];
const luhn = (n) => {
    let sum = 0, alt = false;
    for (let i = n.length - 1; i >= 0; i--) {
        let d = +n[i];
        if (alt) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
        alt = !alt;
    }
    return sum % 10 === 0;
};
// each rule returns an error message, or "" when valid
const RULES = {
    name: (v) => (/^[\p{L}][\p{L}\p{M} .'-]{2,59}$/u.test(v) ? "" : "Enter your full name (3–60 letters)."),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 100 ? "" : "Enter a valid email, e.g. name@example.com."),
    phone: (v) => {
        const digits = v.replace(/\D/g, "").length;
        return /^\+?[0-9 \-]+$/.test(v) && digits >= 7 && digits <= 15 ? "" : "Enter a valid phone number (7–15 digits).";
    },
    address: (v) => (v.length >= 5 && v.length <= 120 ? "" : "Address must be 5–120 characters."),
    city: (v) => (/^[\p{L}][\p{L}\p{M} .'-]{1,49}$/u.test(v) ? "" : "Enter a valid city name."),
    cardNumber: (v) => {
        const n = v.replace(/[\s-]/g, "");
        return /^\d{13,19}$/.test(n) && luhn(n) ? "" : "Enter a valid card number.";
    },
    expiry: (v) => {
        const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(v);
        if (!m) return "Use the format MM/YY.";
        return new Date(2000 + +m[2], +m[1], 1) > new Date() ? "" : "This card has expired.";
    },
    cvv: (v) => (/^\d{3,4}$/.test(v) ? "" : "CVV must be 3 or 4 digits."),
};
const FORMAT = {
    cardNumber: (v) => v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})(?=.)/g, "$1 "),
    expiry: (v) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d; },
    cvv: (v) => v.replace(/\D/g, "").slice(0, 4),
};

function initCheckout() {
    const form = $("checkoutForm");
    const msg = $("checkoutMsg");
    const submitBtn = form.querySelector('button[type="submit"]');
    const showMsg = (html, type) => { // html is always a static string
        msg.innerHTML = html;
        msg.className = "form-msg " + type;
        msg.hidden = false;
    };
    const setError = (input, text) => {
        let el = input.parentElement.querySelector(".field-error");
        if (!el) {
            el = document.createElement("small");
            el.className = "field-error";
            input.parentElement.append(el);
        }
        el.textContent = text;
        input.classList.toggle("invalid", !!text);
        input.setAttribute("aria-invalid", text ? "true" : "false");
    };
    const check = (input) => {
        const rule = RULES[input.name];
        if (!rule || input.closest("[hidden]")) return true; // hidden card fields are skipped
        const v = input.value.trim().replace(/\s+/g, " ");
        const err = v ? rule(v) : "This field is required.";
        setError(input, err);
        return !err;
    };
    const toggleCard = () => { $("cardFields").hidden = $("payment").value !== PAYMENTS[1]; };

    const renderSummary = () => {
        const c = getCart();
        $("orderSummary").innerHTML = c.length
            ? c.map((i) => `<li><span>${esc(i.title)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></li>`).join("")
            : '<li class="muted">Your cart is empty. <a class="back-link" href="products.html">Browse products</a></li>';
        $("checkoutTotal").textContent = money(cartTotal(c));
        submitBtn.disabled = !c.length;
    };

    $("payment").addEventListener("change", toggleCard);
    form.addEventListener("input", (e) => {
        const f = FORMAT[e.target.name];
        if (f) e.target.value = f(e.target.value);
        if (e.target.classList?.contains("invalid")) check(e.target); // live re-check once flagged
    });
    form.addEventListener("focusout", (e) => { if (e.target.matches("input")) check(e.target); });

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        msg.hidden = true;
        const cart = getCart();
        if (!cart.length) return showMsg("Your cart is empty. Add products before placing an order.", "error");
        const bad = [...form.querySelectorAll("input")].filter((i) => !check(i));
        if (bad.length) {
            bad[0].focus();
            return showMsg("Please fix the highlighted fields.", "error");
        }
        const f = Object.fromEntries(new FormData(form));
        if (!PAYMENTS.includes(f.payment)) return showMsg("Please choose a valid payment method.", "error");
        const clean = (v) => String(v).trim().replace(/\s+/g, " ");
        submitBtn.disabled = true; // prevent double submit
        const order = {
            id: Date.now().toString().slice(-8),
            createdAt: Date.now(),
            date: new Date().toLocaleString(),
            customer: { name: clean(f.name), email: clean(f.email), phone: clean(f.phone), address: clean(f.address), city: clean(f.city), payment: f.payment },
            items: cart,
            total: cartTotal(cart),
        };
        store.set("orders", [order, ...getOrders()]);
        saveCart([]);
        form.reset();
        form.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
        form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
        toggleCard();
        renderSummary();
        showMsg('Order placed successfully! Thank you for shopping with us. <a href="orders.html">Track your order</a>', "success");
    });
    toggleCard();
    renderSummary();
}

/* ========== Boot ========== */
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    updateBadge();
    $("menu")?.addEventListener("click", () => $("navLinks").classList.toggle("active"));
    if ($("featuredProducts")) initHome();
    if ($("productGrid")) initProducts();
    if ($("productDetails")) initDetails();
    if ($("cartItems")) initCart();
    if ($("checkoutForm")) initCheckout();
    if ($("ordersList")) initOrders();
});
