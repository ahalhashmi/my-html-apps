const PROGRESS_KEY = "scienceLabGrade4Progress";
const RESULT_KEY = "scienceLabGrade4LastResult";

const stationRail = document.getElementById("station-rail");
const lessonBoard = document.querySelector(".lesson-board");
const quizBoard = document.getElementById("quiz-board");
const stationKicker = document.getElementById("station-kicker");
const stationTitle = document.getElementById("station-title");
const progressPill = document.getElementById("progress-pill");
const visualWrap = document.getElementById("visual-wrap");
const quickNotes = document.getElementById("quick-notes");
const practiceTitle = document.getElementById("practice-title");
const practiceArea = document.getElementById("practice-area");
const feedback = document.getElementById("feedback");

const magneticObjects = [
  { id: "wood", name: "Wooden blocks", image: "assets/wood-blocks.jpg", answer: "non-magnetic" },
  { id: "clips", name: "Paper clips", image: "assets/paper-clip.png", answer: "magnetic" },
  { id: "buttons", name: "Buttons", image: "assets/buttons.jpg", answer: "non-magnetic" },
  { id: "bolts", name: "Nuts and bolts", image: "assets/nuts-bolts.jpg", answer: "magnetic" },
  { id: "ruler", name: "Ruler", image: "assets/ruler.png", answer: "non-magnetic" },
  { id: "eraser", name: "Eraser", image: "assets/eraser.png", answer: "non-magnetic" },
  { id: "wrench", name: "Wrench", image: "assets/wrench.png", answer: "magnetic" },
  { id: "keys", name: "Keys", image: "assets/keys.png", answer: "magnetic" }
];

const stations = [
  {
    id: "magnets",
    title: "Magnet Poles",
    tag: "Attract or repel",
    practiceTitle: "Predict the pull",
    visual: "magnet-pairs",
    notes: [
      ["Opposite poles", "A north pole near a south pole will attract."],
      ["Same poles", "North near north, or south near south, will repel."],
      ["Force", "Magnets can push or pull without touching."]
    ]
  },
  {
    id: "broken",
    title: "Broken Magnets",
    tag: "New poles",
    practiceTitle: "Choose what happens",
    visual: "broken-magnet",
    notes: [
      ["Two magnets", "A broken magnet becomes two smaller magnets."],
      ["New poles", "Each piece still has a north pole and a south pole."],
      ["No single pole", "You do not get only north or only south by breaking a magnet."]
    ]
  },
  {
    id: "materials",
    title: "Magnetic Materials",
    tag: "Sort objects",
    practiceTitle: "Tap magnetic or non-magnetic",
    visual: "magnetic-materials",
    notes: [
      ["Magnetic", "Paper clips, nuts and bolts, a wrench, and keys are magnetic."],
      ["Non-magnetic", "Wood, buttons, a ruler, and an eraser are non-magnetic."],
      ["Useful test", "If a magnet pulls an object, the object is magnetic."]
    ]
  },
  {
    id: "electromagnet",
    title: "Electromagnet Lab",
    tag: "Nail, wire, battery",
    practiceTitle: "Label and strengthen it",
    visual: "electromagnet",
    notes: [
      ["Battery", "The battery provides energy for the current."],
      ["Wire", "The wire is the pathway for the electric energy."],
      ["Stronger magnet", "More turns of wire or a stronger battery can pick up more paper clips."]
    ]
  },
  {
    id: "electricity",
    title: "Conductors and Insulators",
    tag: "Electric flow",
    practiceTitle: "Sort fast examples",
    visual: "electricity",
    notes: [
      ["Conductor", "A conductor lets electric charges pass through easily."],
      ["Insulator", "An insulator resists the flow of electric charges."],
      ["Flow", "Electrical devices work when electrons flow through them."],
      ["Plug safety", "The parts you hold are insulators; the metal parts are conductors."]
    ]
  },
  {
    id: "circuits",
    title: "Series and Parallel Circuits",
    tag: "One path or many",
    practiceTitle: "Find the circuit idea",
    visual: "circuits",
    notes: [
      ["Series", "A series circuit has one pathway for electric current."],
      ["Parallel", "A parallel circuit has two or more pathways for current."],
      ["Brightness", "Two bulbs in series share current and get dimmer. Parallel bulbs can stay bright."],
      ["Everyday use", "House wiring is usually parallel so devices can work separately."]
    ]
  },
  {
    id: "light",
    title: "Light, Reflection, Refraction",
    tag: "How light moves",
    practiceTitle: "Classify light behavior",
    visual: "light",
    notes: [
      ["Transparent", "Light passes completely through."],
      ["Translucent", "Light passes partially through."],
      ["Opaque", "Light does not pass through."],
      ["Reflection", "Light bounces off a surface. Refraction is bending as light enters another medium."]
    ]
  }
];

const practiceState = {
  magnets: {},
  broken: "",
  materials: {},
  electromagnet: {
    labels: {},
    turns: 30,
    ways: {}
  },
  electricity: {},
  circuits: {},
  light: {}
};

let progress = loadProgress();
let currentStation = 0;
let circuitState = { seriesSecond: true, parallelSecond: true };
let quizIndex = 0;
let quizAnswers = [];

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function setFeedback(message, type = "") {
  feedback.textContent = message;
  feedback.className = `feedback ${type ? `is-${type}` : ""}`;
}

function stationIsDone(id) {
  return Boolean(progress[id]);
}

function markComplete(id, message) {
  if (!progress[id]) {
    progress[id] = true;
    saveProgress();
    updateNavigation();
  }
  updateProgressPill();
  if (message) setFeedback(message, "good");
}

function updateProgressPill() {
  const done = stations.filter((station) => stationIsDone(station.id)).length;
  progressPill.textContent = `${done} of ${stations.length} done`;
}

function updateNavigation() {
  stationRail.innerHTML = stations.map((station, index) => `
    <button class="station-tab ${index === currentStation ? "is-active" : ""} ${stationIsDone(station.id) ? "is-done" : ""}" type="button" data-index="${index}">
      <span class="tab-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="tab-label">${station.title}</span>
      <span class="status-dot">${stationIsDone(station.id) ? "OK" : ""}</span>
    </button>
  `).join("");

  stationRail.querySelectorAll(".station-tab").forEach((button) => {
    button.addEventListener("click", () => renderStation(Number(button.dataset.index)));
  });
}

function renderStation(index) {
  currentStation = Math.max(0, Math.min(stations.length - 1, index));
  const station = stations[currentStation];
  stationKicker.textContent = `${station.tag} - Station ${currentStation + 1}`;
  stationTitle.textContent = station.title;
  practiceTitle.textContent = station.practiceTitle;
  quickNotes.innerHTML = station.notes.map(([title, text]) => `
    <article class="note">
      <h3>${title}</h3>
      <p>${text}</p>
    </article>
  `).join("");

  renderVisual(station);
  renderPractice(station.id);
  updateNavigation();
  updateProgressPill();

  document.getElementById("prev-station").disabled = currentStation === 0;
  document.getElementById("next-station").textContent = currentStation === stations.length - 1 ? "Review first station" : "Next station";
}

function renderVisual(station) {
  const visuals = {
    "magnet-pairs": `
      <figure>
        <img src="assets/magnet-pairs.png" alt="Pairs of magnets showing attract and repel cases">
        <figcaption class="visual-caption">Look at the poles facing each other first.</figcaption>
      </figure>
    `,
    "broken-magnet": `
      <figure>
        <img src="assets/broken-magnet.png" alt="A bar magnet breaking into two magnets">
        <figcaption class="visual-caption">After the break, each piece has both poles.</figcaption>
      </figure>
    `,
    "magnetic-materials": `
      <div class="object-grid">
        ${magneticObjects.map((item) => `
          <div class="touch-card object-card">
            <img src="${item.image}" alt="${item.name}">
            <h4>${item.name}</h4>
          </div>
        `).join("")}
      </div>
    `,
    electromagnet: `
      <figure>
        <div class="image-strip">
          <img src="assets/electromagnet.png" alt="Electromagnet made from a nail, coiled wire, and battery">
          <img src="assets/coil-graph.png" alt="Graph showing more coil turns pick up more paper clips">
        </div>
        <figcaption class="visual-caption">More coil turns picked up more paper clips in the experiment.</figcaption>
      </figure>
    `,
    electricity: `
      <div class="light-lab">
        <div class="light-type-grid">
          <div class="light-type">
            <strong>Conductors</strong>
            <p class="muted">metals, copper, gold, silver, iron, steel</p>
          </div>
          <div class="light-type">
            <strong>Insulators</strong>
            <p class="muted">glass, wood, plastic, paper, rubber, air, fabric, oil</p>
          </div>
          <div class="light-type">
            <strong>Current</strong>
            <p class="muted">moving electrons power electrical devices</p>
          </div>
        </div>
      </div>
    `,
    circuits: renderCircuitLab(),
    light: `
      <div class="light-lab">
        <div class="light-type-grid">
          <div class="light-type">
            <div class="light-demo"></div>
            <strong>Transparent</strong>
            <p class="muted">all light passes</p>
          </div>
          <div class="light-type">
            <div class="light-demo translucent"></div>
            <strong>Translucent</strong>
            <p class="muted">some light passes</p>
          </div>
          <div class="light-type">
            <div class="light-demo opaque"></div>
            <strong>Opaque</strong>
            <p class="muted">light is blocked</p>
          </div>
        </div>
        <div class="image-strip">
          <img src="assets/reflection.png" alt="Reflection ray diagram">
          <img src="assets/refraction.jpg" alt="Refraction diagram with pencil in water">
        </div>
      </div>
    `
  };

  visualWrap.innerHTML = visuals[station.visual];
  if (station.id === "circuits") attachCircuitEvents();
}

function renderCircuitLab() {
  return `
    <div class="circuit-lab">
      <div class="circuit-panels">
        <article class="circuit-panel">
          <h3>Series circuit</h3>
          ${seriesSvg(circuitState.seriesSecond)}
          <button class="secondary-button switch-button" id="toggle-series" type="button">${circuitState.seriesSecond ? "Remove second bulb" : "Add second bulb"}</button>
        </article>
        <article class="circuit-panel">
          <h3>Parallel circuit</h3>
          ${parallelSvg(circuitState.parallelSecond)}
          <button class="secondary-button switch-button" id="toggle-parallel" type="button">${circuitState.parallelSecond ? "Remove second path" : "Add second path"}</button>
        </article>
      </div>
    </div>
  `;
}

function seriesSvg(secondBulb) {
  const firstClass = secondBulb ? "bulb-glow dim" : "bulb-glow";
  const secondOpacity = secondBulb ? "1" : "0.18";
  return `
    <svg class="circuit-svg" viewBox="0 0 320 240" aria-label="Series circuit diagram">
      <path class="wire" d="M70 176 H250 V62 H70 Z"></path>
      <rect class="battery-cell" x="138" y="168" width="44" height="24" rx="4"></rect>
      <circle class="${firstClass}" cx="118" cy="62" r="35"></circle>
      <circle class="bulb-shell" cx="118" cy="62" r="22"></circle>
      <path d="M105 62 Q118 78 131 62" fill="none" stroke="#725000" stroke-width="3"></path>
      <g opacity="${secondOpacity}">
        <circle class="bulb-glow dim" cx="204" cy="62" r="35"></circle>
        <circle class="bulb-shell" cx="204" cy="62" r="22"></circle>
        <path d="M191 62 Q204 78 217 62" fill="none" stroke="#725000" stroke-width="3"></path>
      </g>
      <text x="160" y="218" text-anchor="middle" fill="#5b6c73" font-size="16">${secondBulb ? "One path, bulbs share current" : "One bulb gets the full current"}</text>
    </svg>
  `;
}

function parallelSvg(secondPath) {
  const secondOpacity = secondPath ? "1" : "0.18";
  return `
    <svg class="circuit-svg" viewBox="0 0 320 240" aria-label="Parallel circuit diagram">
      <path class="wire" d="M64 188 V54 H256 V188"></path>
      <path class="branch-wire" d="M64 88 H256"></path>
      <path class="branch-wire" d="M64 142 H256" opacity="${secondPath ? "1" : "0.18"}"></path>
      <rect class="battery-cell" x="136" y="176" width="48" height="24" rx="4"></rect>
      <circle class="bulb-glow" cx="160" cy="88" r="31"></circle>
      <circle class="bulb-shell" cx="160" cy="88" r="20"></circle>
      <path d="M148 88 Q160 102 172 88" fill="none" stroke="#725000" stroke-width="3"></path>
      <g opacity="${secondOpacity}">
        <circle class="bulb-glow" cx="160" cy="142" r="31"></circle>
        <circle class="bulb-shell" cx="160" cy="142" r="20"></circle>
        <path d="M148 142 Q160 156 172 142" fill="none" stroke="#725000" stroke-width="3"></path>
      </g>
      <text x="160" y="222" text-anchor="middle" fill="#5b6c73" font-size="16">${secondPath ? "Separate paths keep bulbs bright" : "One path can still work alone"}</text>
    </svg>
  `;
}

function attachCircuitEvents() {
  const seriesButton = document.getElementById("toggle-series");
  const parallelButton = document.getElementById("toggle-parallel");
  if (seriesButton) {
    seriesButton.addEventListener("click", () => {
      circuitState.seriesSecond = !circuitState.seriesSecond;
      renderVisual(stations[currentStation]);
    });
  }
  if (parallelButton) {
    parallelButton.addEventListener("click", () => {
      circuitState.parallelSecond = !circuitState.parallelSecond;
      renderVisual(stations[currentStation]);
    });
  }
}

function renderPractice(id) {
  const renderers = {
    magnets: renderMagnetPractice,
    broken: renderBrokenPractice,
    materials: renderMaterialObjectsPractice,
    electromagnet: renderElectromagnetPractice,
    electricity: renderElectricityPractice,
    circuits: renderCircuitPractice,
    light: renderLightPractice
  };
  renderers[id]();
}

function renderMagnetPractice() {
  const pairs = [
    { id: "a", left: ["S", "N"], right: ["S", "N"], answer: "attract" },
    { id: "b", left: ["N", "S"], right: ["S", "N"], answer: "repel" },
    { id: "c", left: ["S", "N"], right: ["N", "S"], answer: "repel" },
    { id: "d", left: ["N", "S"], right: ["N", "S"], answer: "attract" }
  ];
  practiceArea.innerHTML = `
    <div class="magnet-challenge">
      ${pairs.map((pair) => `
        <div class="touch-card magnet-row">
          <div class="magnet-pair">${magnetBar(pair.left)} ${magnetBar(pair.right)}</div>
          <div class="mini-choice-row">
            ${["attract", "repel"].map((choice) => optionButton(choice, practiceState.magnets[pair.id], pair.answer, `data-pair="${pair.id}"`)).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;

  practiceArea.querySelectorAll("[data-pair]").forEach((button) => {
    button.addEventListener("click", () => {
      practiceState.magnets[button.dataset.pair] = button.dataset.value;
      renderMagnetPractice();
    });
  });

  evaluateSimpleSet(pairs, practiceState.magnets, "magnets", "All pole predictions are correct.");
}

function magnetBar(poles) {
  return `
    <div class="bar-magnet" aria-label="Magnet ${poles.join(" ")}">
      <span class="pole ${poles[0].toLowerCase()}">${poles[0]}</span>
      <span class="pole ${poles[1].toLowerCase()}">${poles[1]}</span>
    </div>
  `;
}

function renderBrokenPractice() {
  const choices = [
    { id: "two", text: "Two smaller magnets, each with N and S", answer: true },
    { id: "weak", text: "One weak magnet and one piece with no poles", answer: false },
    { id: "north", text: "One north piece and one south piece", answer: false }
  ];

  practiceArea.innerHTML = `
    <div class="broken-grid">
      ${choices.map((choice) => `
        <button class="option-button ${practiceState.broken === choice.id ? choice.answer ? "is-correct" : "is-wrong" : ""}" type="button" data-broken="${choice.id}">
          ${choice.text}
        </button>
      `).join("")}
    </div>
  `;

  practiceArea.querySelectorAll("[data-broken]").forEach((button) => {
    button.addEventListener("click", () => {
      practiceState.broken = button.dataset.broken;
      renderBrokenPractice();
    });
  });

  if (!practiceState.broken) {
    setFeedback("Tap the answer that matches the broken magnet drawing.");
    return;
  }

  if (practiceState.broken === "two") {
    markComplete("broken", "Correct. Each broken piece becomes a new magnet with both poles.");
  } else {
    setFeedback("Close. A magnet does not split into a north-only and south-only piece.", "warn");
  }
}

function renderMaterialObjectsPractice() {
  practiceArea.innerHTML = `
    <div class="object-grid">
      ${magneticObjects.map((item) => objectChoiceCard(item, practiceState.materials[item.id], `data-object="${item.id}"`)).join("")}
    </div>
  `;

  practiceArea.querySelectorAll("[data-object]").forEach((button) => {
    button.addEventListener("click", () => {
      practiceState.materials[button.dataset.object] = button.dataset.value;
      renderMaterialObjectsPractice();
    });
  });

  evaluateSimpleSet(magneticObjects, practiceState.materials, "materials", "Great sorting. You matched the whole table.");
}

function objectChoiceCard(item, selected, dataAttr) {
  return `
    <article class="touch-card">
      <div class="object-card">
        <img src="${item.image}" alt="${item.name}">
        <div>
          <h4>${item.name}</h4>
          <div class="binary-row">
            ${optionButton("magnetic", selected, item.answer, dataAttr)}
            ${optionButton("non-magnetic", selected, item.answer, dataAttr)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderElectromagnetPractice() {
  const targets = [
    { id: "source", prompt: "Provides energy for the current", answer: "battery" },
    { id: "pathway", prompt: "Pathway for electric energy", answer: "wire" },
    { id: "core", prompt: "Metal part wrapped by wire", answer: "nail" }
  ];
  const labels = ["battery", "wire", "nail"];
  const ways = [
    { id: "moreCoils", label: "More turns of wire", correct: true },
    { id: "strongerBattery", label: "Stronger battery", correct: true },
    { id: "lessCoils", label: "Fewer wire turns", correct: false },
    { id: "removeBattery", label: "Remove the battery", correct: false }
  ];
  const clips = clipsForTurns(practiceState.electromagnet.turns);

  practiceArea.innerHTML = `
    <div class="label-grid">
      ${targets.map((target) => `
        <div class="label-row">
          <p>${target.prompt}</p>
          <div class="mini-choice-row">
            ${labels.map((label) => optionButton(label, practiceState.electromagnet.labels[target.id], target.answer, `data-label-target="${target.id}"`)).join("")}
          </div>
        </div>
      `).join("")}
    </div>
    <div class="range-lab">
      <label for="turn-slider">
        <span>Coil turns</span>
        <span id="turn-count">${practiceState.electromagnet.turns} turns = about ${clips} clips</span>
      </label>
      <input id="turn-slider" type="range" min="10" max="50" step="10" value="${practiceState.electromagnet.turns}">
      <div class="clip-meter" aria-hidden="true"><span id="clip-meter-fill" style="width:${Math.min(100, clips / 60 * 100)}%"></span></div>
      <div class="strength-options">
        ${ways.map((way) => `
          <label class="check-option">
            <input type="checkbox" data-way="${way.id}" ${practiceState.electromagnet.ways[way.id] ? "checked" : ""}>
            <span>${way.label}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `;

  practiceArea.querySelectorAll("[data-label-target]").forEach((button) => {
    button.addEventListener("click", () => {
      practiceState.electromagnet.labels[button.dataset.labelTarget] = button.dataset.value;
      renderElectromagnetPractice();
    });
  });

  const slider = document.getElementById("turn-slider");
  slider.addEventListener("input", () => {
    practiceState.electromagnet.turns = Number(slider.value);
    const liveClips = clipsForTurns(practiceState.electromagnet.turns);
    document.getElementById("turn-count").textContent = `${practiceState.electromagnet.turns} turns = about ${liveClips} clips`;
    document.getElementById("clip-meter-fill").style.width = `${Math.min(100, liveClips / 60 * 100)}%`;
    evaluateElectromagnet(targets, ways);
  });

  practiceArea.querySelectorAll("[data-way]").forEach((input) => {
    input.addEventListener("change", () => {
      practiceState.electromagnet.ways[input.dataset.way] = input.checked;
      evaluateElectromagnet(targets, ways);
    });
  });

  evaluateElectromagnet(targets, ways);
}

function clipsForTurns(turns) {
  const data = { 10: 5, 20: 12, 30: 21, 40: 39, 50: 60 };
  return data[turns] || 21;
}

function evaluateElectromagnet(targets, ways) {
  const labels = practiceState.electromagnet.labels;
  const allLabelsDone = targets.every((target) => labels[target.id]);
  const labelsCorrect = targets.every((target) => labels[target.id] === target.answer);
  const chosenWays = practiceState.electromagnet.ways;
  const waysCorrect = ways.every((way) => Boolean(chosenWays[way.id]) === way.correct);

  if (labelsCorrect && waysCorrect && practiceState.electromagnet.turns >= 40) {
    markComplete("electromagnet", "Excellent. Labels, graph pattern, and strengthening ideas all match.");
  } else if (!allLabelsDone) {
    setFeedback("Label the battery, wire, and nail first.");
  } else if (!labelsCorrect) {
    setFeedback("Check the labels again: battery gives energy, wire is the path, nail is the metal core.", "warn");
  } else if (!waysCorrect) {
    setFeedback("Pick only the changes that make the electromagnet stronger.", "warn");
  } else {
    setFeedback("Move the slider toward more coil turns to see the graph idea.", "warn");
  }
}

function renderElectricityPractice() {
  const examples = [
    { id: "copper", name: "Copper", answer: "conductor" },
    { id: "steel", name: "Steel", answer: "conductor" },
    { id: "metalPlug", name: "Metal plug prongs", answer: "conductor" },
    { id: "wood", name: "Wood", answer: "insulator" },
    { id: "plastic", name: "Plastic wire cover", answer: "insulator" },
    { id: "rubber", name: "Rubber", answer: "insulator" },
    { id: "paper", name: "Paper", answer: "insulator" },
    { id: "gold", name: "Gold", answer: "conductor" }
  ];

  practiceArea.innerHTML = `
    <div class="material-grid">
      ${examples.map((item) => `
        <div class="material-row">
          <p><strong>${item.name}</strong></p>
          <div class="binary-row">
            ${optionButton("conductor", practiceState.electricity[item.id], item.answer, `data-electric="${item.id}"`)}
            ${optionButton("insulator", practiceState.electricity[item.id], item.answer, `data-electric="${item.id}"`)}
          </div>
        </div>
      `).join("")}
    </div>
  `;

  practiceArea.querySelectorAll("[data-electric]").forEach((button) => {
    button.addEventListener("click", () => {
      practiceState.electricity[button.dataset.electric] = button.dataset.value;
      renderElectricityPractice();
    });
  });

  evaluateSimpleSet(examples, practiceState.electricity, "electricity", "Correct. Conductors let charge flow; insulators resist it.");
}

function renderCircuitPractice() {
  const prompts = [
    { id: "onePath", name: "Only one pathway for electric current", answer: "series" },
    { id: "twoPaths", name: "Two pathways for electric current", answer: "parallel" },
    { id: "dim", name: "Adding a second bulb makes the first bulb less bright", answer: "series" },
    { id: "independent", name: "One device can stop while other devices still work", answer: "parallel" }
  ];

  practiceArea.innerHTML = `
    <div class="material-grid">
      ${prompts.map((item) => `
        <div class="material-row">
          <p><strong>${item.name}</strong></p>
          <div class="binary-row">
            ${optionButton("series", practiceState.circuits[item.id], item.answer, `data-circuit="${item.id}"`)}
            ${optionButton("parallel", practiceState.circuits[item.id], item.answer, `data-circuit="${item.id}"`)}
          </div>
        </div>
      `).join("")}
    </div>
  `;

  practiceArea.querySelectorAll("[data-circuit]").forEach((button) => {
    button.addEventListener("click", () => {
      practiceState.circuits[button.dataset.circuit] = button.dataset.value;
      renderCircuitPractice();
    });
  });

  evaluateSimpleSet(prompts, practiceState.circuits, "circuits", "Nice. You can tell series and parallel circuits apart.");
}

function renderLightPractice() {
  const prompts = [
    { id: "clear", name: "Clear glass window", answer: "transparent" },
    { id: "wax", name: "Wax paper or frosted glass", answer: "translucent" },
    { id: "book", name: "Book, wood, or metal sheet", answer: "opaque" },
    { id: "mirror", name: "Light bounces off a mirror", answer: "reflection" },
    { id: "water", name: "A pencil looks bent in water", answer: "refraction" }
  ];

  practiceArea.innerHTML = `
    <div class="material-grid">
      ${prompts.map((item) => `
        <div class="material-row">
          <p><strong>${item.name}</strong></p>
          <div class="choice-grid">
            ${lightChoices(item).map((choice) => optionButton(choice, practiceState.light[item.id], item.answer, `data-light="${item.id}"`)).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;

  practiceArea.querySelectorAll("[data-light]").forEach((button) => {
    button.addEventListener("click", () => {
      practiceState.light[button.dataset.light] = button.dataset.value;
      renderLightPractice();
    });
  });

  evaluateSimpleSet(prompts, practiceState.light, "light", "Bright work. You matched light passing, bouncing, and bending.");
}

function lightChoices(item) {
  if (item.id === "mirror" || item.id === "water") return ["reflection", "refraction"];
  return ["transparent", "translucent", "opaque"];
}

function optionButton(value, selected, answer, extraAttrs = "") {
  const stateClass = selected === value ? selected === answer ? "is-selected is-correct" : "is-selected is-wrong" : "";
  const label = value.replace("-", " ");
  return `<button class="small-option ${stateClass}" type="button" data-value="${value}" ${extraAttrs}>${label}</button>`;
}

function evaluateSimpleSet(items, selections, stationId, successMessage) {
  const allDone = items.every((item) => selections[item.id]);
  const correct = items.filter((item) => selections[item.id] === item.answer).length;

  if (!allDone) {
    setFeedback(`${correct}/${items.length} correct so far. Finish every item.`);
    return;
  }

  if (correct === items.length) {
    markComplete(stationId, successMessage);
  } else {
    setFeedback(`${correct}/${items.length} correct. Fix the red choices and try again.`, "warn");
  }
}

const quizQuestions = [
  {
    question: "What happens when a north pole faces a south pole?",
    options: ["They attract", "They repel", "They stop being magnets", "They become insulators"],
    answer: "They attract"
  },
  {
    question: "What happens when two north poles face each other?",
    options: ["They repel", "They attract", "They make electricity", "They become transparent"],
    answer: "They repel"
  },
  {
    question: "A bar magnet breaks into two pieces. What is true?",
    options: ["Each piece has a north and south pole", "One piece is only north", "The poles disappear", "Only the bigger piece is magnetic"],
    answer: "Each piece has a north and south pole"
  },
  {
    question: "Which object from the revision sheet is magnetic?",
    options: ["Paper clip", "Wooden blocks", "Eraser", "Ruler"],
    answer: "Paper clip"
  },
  {
    question: "Which group is non-magnetic?",
    options: ["Wooden blocks, buttons, ruler, eraser", "Keys, wrench, paper clips, nuts", "Paper clips, ruler, keys, bolts", "Wrench, eraser, keys, bolts"],
    answer: "Wooden blocks, buttons, ruler, eraser"
  },
  {
    question: "In an electromagnet, what does the battery do?",
    options: ["Provides energy for the current", "Blocks the electrons", "Makes the nail non-magnetic", "Reflects light"],
    answer: "Provides energy for the current"
  },
  {
    question: "How can you strengthen an electromagnet?",
    options: ["Add more wire turns or use a stronger battery", "Remove the battery", "Use fewer coils", "Replace the nail with wood"],
    answer: "Add more wire turns or use a stronger battery"
  },
  {
    question: "In the coil graph, what happens as more turns are added?",
    options: ["More paper clips are picked up", "Fewer clips are picked up", "The battery disappears", "Light bends less"],
    answer: "More paper clips are picked up"
  },
  {
    question: "A material that resists electric charges is called a...",
    options: ["Insulator", "Conductor", "Battery", "Magnet pole"],
    answer: "Insulator"
  },
  {
    question: "A material that lets electric charges pass through easily is a...",
    options: ["Conductor", "Insulator", "Mirror", "Translucent object"],
    answer: "Conductor"
  },
  {
    question: "Electrical devices work when what flows through them?",
    options: ["Electrons", "Wooden blocks", "Opaque light", "Reflected pencils"],
    answer: "Electrons"
  },
  {
    question: "What is a series circuit?",
    options: ["A circuit with one pathway for current", "A circuit with two or more pathways", "A circuit that bends light", "A circuit with no battery"],
    answer: "A circuit with one pathway for current"
  },
  {
    question: "Why is a parallel circuit useful at home?",
    options: ["Devices can work separately", "All bulbs must turn off together", "It has only one pathway", "It makes objects magnetic"],
    answer: "Devices can work separately"
  },
  {
    question: "If light passes completely through an object, the object is...",
    options: ["Transparent", "Translucent", "Opaque", "Magnetic"],
    answer: "Transparent"
  },
  {
    question: "Why does a pencil look bent or broken in water?",
    options: ["Light refracts as it passes between air and water", "Light is blocked completely", "The pencil becomes magnetic", "The mirror absorbs the pencil"],
    answer: "Light refracts as it passes between air and water"
  }
];

function openQuiz() {
  lessonBoard.hidden = true;
  stationRail.hidden = true;
  quizBoard.hidden = false;
  quizIndex = 0;
  if (quizAnswers.length !== quizQuestions.length) quizAnswers = Array(quizQuestions.length).fill("");
  renderQuiz();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeQuiz() {
  quizBoard.hidden = true;
  lessonBoard.hidden = false;
  stationRail.hidden = false;
  renderStation(currentStation);
}

function renderQuiz() {
  const question = quizQuestions[quizIndex];
  const fill = document.getElementById("quiz-meter-fill");
  const count = document.getElementById("quiz-count");
  const card = document.getElementById("quiz-card");
  const next = document.getElementById("quiz-next");
  const prev = document.getElementById("quiz-prev");
  const selected = quizAnswers[quizIndex];

  fill.style.width = `${((quizIndex + 1) / quizQuestions.length) * 100}%`;
  count.textContent = `Question ${quizIndex + 1} of ${quizQuestions.length}`;
  card.innerHTML = `
    <h3>${question.question}</h3>
    <div class="quiz-options">
      ${question.options.map((option) => `
        <button class="quiz-option ${selected === option ? "is-selected" : ""}" type="button" data-quiz-option="${option}">
          ${option}
        </button>
      `).join("")}
    </div>
  `;

  card.querySelectorAll("[data-quiz-option]").forEach((button) => {
    button.addEventListener("click", () => {
      quizAnswers[quizIndex] = button.dataset.quizOption;
      renderQuiz();
    });
  });

  prev.disabled = quizIndex === 0;
  next.disabled = !quizAnswers[quizIndex];
  next.textContent = quizIndex === quizQuestions.length - 1 ? "Finish quiz" : "Next";
}

function finishQuiz() {
  const answers = quizQuestions.map((question, index) => {
    const selected = quizAnswers[index] || "";
    return {
      question: question.question,
      selected,
      correctAnswer: question.answer,
      correct: selected === question.answer
    };
  });
  const score = answers.filter((answer) => answer.correct).length;
  const result = {
    student: "Student",
    finishedAt: new Date().toISOString(),
    score,
    total: quizQuestions.length,
    answers
  };

  localStorage.setItem(RESULT_KEY, JSON.stringify(result));
  showResult(result);
}

function encodeResult(result) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(result))));
}

function resultUrl(result) {
  const url = new URL("results.html", window.location.href);
  url.searchParams.set("r", encodeResult(result));
  return url.toString();
}

function showResult(result) {
  const template = document.getElementById("result-template");
  const modal = template.content.firstElementChild.cloneNode(true);
  const percent = Math.round((result.score / result.total) * 100);
  const shareUrl = resultUrl(result);

  modal.querySelector("#result-title").textContent = percent >= 80 ? "Great work" : "Good practice";
  modal.querySelector("#result-score").textContent = `Score: ${result.score}/${result.total} (${percent}%)`;
  modal.querySelector("#result-page-link").href = shareUrl;
  modal.querySelector("#copy-result-link").addEventListener("click", async () => {
    await copyText(shareUrl);
    modal.querySelector("#copy-result-link").textContent = "Copied";
  });
  modal.querySelector("#result-close").addEventListener("click", () => {
    modal.remove();
    closeQuiz();
  });

  document.body.appendChild(modal);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

document.getElementById("prev-station").addEventListener("click", () => renderStation(currentStation - 1));
document.getElementById("next-station").addEventListener("click", () => {
  renderStation(currentStation === stations.length - 1 ? 0 : currentStation + 1);
});
document.getElementById("quiz-open").addEventListener("click", openQuiz);
document.getElementById("close-quiz").addEventListener("click", closeQuiz);
document.getElementById("quiz-prev").addEventListener("click", () => {
  quizIndex = Math.max(0, quizIndex - 1);
  renderQuiz();
});
document.getElementById("quiz-next").addEventListener("click", () => {
  if (!quizAnswers[quizIndex]) return;
  if (quizIndex === quizQuestions.length - 1) {
    finishQuiz();
  } else {
    quizIndex += 1;
    renderQuiz();
  }
});
document.getElementById("reset-progress").addEventListener("click", () => {
  progress = {};
  saveProgress();
  setFeedback("Practice progress reset. Quiz results are kept on the results page.");
  renderStation(currentStation);
});

renderStation(0);
