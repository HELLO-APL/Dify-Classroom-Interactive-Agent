const ICONS = {
  "arrow-up-right": [
    '<path d="M7 7h10v10"></path>',
    '<path d="M7 17 17 7"></path>',
  ],
  "bookmark-check": [
    '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"></path>',
    '<path d="m9 10 2 2 4-4"></path>',
  ],
  "bookmark-plus": [
    '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h7"></path>',
    '<path d="M16 5h6"></path>',
    '<path d="M19 2v6"></path>',
  ],
  "chart-no-axes-combined": [
    '<path d="M3 3v18h18"></path>',
    '<path d="M7 16v-5"></path>',
    '<path d="M12 16V8"></path>',
    '<path d="M17 16v-3"></path>',
  ],
  "chevron-left": ['<path d="m15 18-6-6 6-6"></path>'],
  construction: [
    '<rect width="20" height="8" x="2" y="6" rx="1"></rect>',
    '<path d="M17 14v7"></path>',
    '<path d="M7 14v7"></path>',
    '<path d="M17 3v3"></path>',
    '<path d="M7 3v3"></path>',
    '<path d="M10 14 2.3 6.3"></path>',
    '<path d="m14 6 7.7 7.7"></path>',
    '<path d="m8 6 8 8"></path>',
  ],
  "external-link": [
    '<path d="M15 3h6v6"></path>',
    '<path d="M10 14 21 3"></path>',
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>',
  ],
  "library-big": [
    '<path d="m16 6 4 14"></path>',
    '<path d="M12 6v14"></path>',
    '<path d="M8 8v12"></path>',
    '<path d="M4 4v16"></path>',
  ],
  "notebook-tabs": [
    '<path d="M2 6h4"></path>',
    '<path d="M2 10h4"></path>',
    '<path d="M2 14h4"></path>',
    '<path d="M2 18h4"></path>',
    '<rect width="16" height="20" x="4" y="2" rx="2"></rect>',
    '<path d="M15 2v20"></path>',
  ],
  play: ['<polygon points="6 3 20 12 6 21 6 3"></polygon>'],
  save: [
    '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8A2 2 0 0 1 21 8.8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path>',
    '<path d="M17 21v-8H7v8"></path>',
    '<path d="M7 3v5h8"></path>',
  ],
  x: ['<path d="M18 6 6 18"></path>', '<path d="m6 6 12 12"></path>'],
};

function createIcons({ attrs = {} } = {}) {
  document.querySelectorAll("[data-lucide]").forEach((placeholder) => {
    const name = placeholder.getAttribute("data-lucide");
    const paths = ICONS[name];
    if (!paths) return;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const [key, value] of Object.entries(attrs)) {
      svg.setAttribute(key, value);
    }
    svg.innerHTML = paths.join("");
    placeholder.replaceWith(svg);
  });
}

globalThis.lucide = { createIcons };
