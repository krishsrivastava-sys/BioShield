let nations = [];
let diseases = [];
let nodeCounter = 0;
let selectedNation = null;
let selectedDisease = "";
let simulationRunning = false;
let waveHandle = null;
let isCirculating = false;
let waveInProgress = false;
let circulationPhase = 0;
let activeWaveResolver = null;
let pandemicActive = false;
let notificationHideHandle = null;
let notificationAudioContext = null;
const AUTO_NODE_MINIMUM = 4;

const canvas = d3.select("#network-canvas");
const nationLayer = d3.select("#nation-list");
const simulationPanel = document.getElementById("simulation-panel");

const mainNode = {
    id: "main-server",
    name: "India",
    total_affiliated: 5,
    image: "https://flagcdn.com/w320/in.png",
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    fx: window.innerWidth / 2,
    fy: window.innerHeight / 2
};

selectedNation = mainNode;

const nodes = [mainNode];
const links = [];
const nationSimulationState = new Map();

const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(180).strength(0.95))
    .force("charge", d3.forceManyBody().strength(-340))
    .force("collide", d3.forceCollide(55))
    .force("x", d3.forceX(window.innerWidth / 2).strength(0.015))
    .force("y", d3.forceY(window.innerHeight / 2).strength(0.015))
    .alphaDecay(0.08)
    .on("tick", ticked);

function updateCanvasSize() {
    canvas.attr("width", window.innerWidth).attr("height", window.innerHeight);
    mainNode.fx = window.innerWidth / 2;
    mainNode.fy = window.innerHeight / 2;
    simulation.force("x", d3.forceX(window.innerWidth / 2).strength(0.015));
    simulation.force("y", d3.forceY(window.innerHeight / 2).strength(0.015));
    simulation.alpha(0.4).restart();
}

function ticked() {
    const lineSelection = canvas.selectAll("line").data(links, (d) => `${d.source.id || d.source}-${d.target.id || d.target}`);

    lineSelection.enter().append("line").merge(lineSelection)
        .classed("distributed-link", true)
        .classed("backbone-link", (d) => Boolean(d.backbone))
        .classed("circulating-link", (d) => isCirculating && isLinkCirculating(d))
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

    lineSelection.exit().remove();

    const nodeSelection = nationLayer.selectAll(".nation-bubble").data(nodes, (d) => d.id);

    const nodeEnter = nodeSelection.enter()
        .append("div")
        .attr("class", "nation-bubble")
        .on("dblclick", (_, d) => openCard(d))
        .call(
            d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended)
        );

    nodeEnter.append("img")
        .attr("class", "bubble-flag")
        .attr("src", (d) => d.image)
        .attr("alt", (d) => `${d.name} flag`);

    nodeEnter.append("div")
        .attr("class", "bubble-tooltip")
        .text((d) => d.name);

    nodeSelection.merge(nodeEnter)
        .style("left", (d) => `${d.x - 39}px`)
        .style("top", (d) => `${d.y - 39}px`);

    nodeSelection.exit().remove();
}

function isLinkCirculating(link) {
    const sourceId = link.source.id || link.source;
    const targetId = link.target.id || link.target;
    const key = `${sourceId}|${targetId}`;
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
        hash = (hash + key.charCodeAt(index)) % 101;
    }
    return ((hash + circulationPhase) % 5) < 3;
}

function dragstarted(event) {
    if (!event.active) {
        simulation.alphaTarget(0.25).restart();
    }
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
}

function dragged(event) {
    if (event.subject.id === "main-server") {
        return;
    }
    event.subject.fx = event.x;
    event.subject.fy = event.y;
}

function dragended(event) {
    if (!event.active) {
        simulation.alphaTarget(0);
    }
    if (event.subject.id !== "main-server") {
        event.subject.fx = null;
        event.subject.fy = null;
    }
}

function openCard(data) {
    const sideCard = document.getElementById("side-card");
    sideCard.classList.add("active");
    sideCard.setAttribute("aria-hidden", "false");

    selectedNation = data;
    syncTargetNationSelect(data.id);
    renderNationCard(data);
}

function closeCard() {
    const sideCard = document.getElementById("side-card");
    sideCard.classList.remove("active");
    sideCard.setAttribute("aria-hidden", "true");
}

function showSimulationPanel(show) {
    if (!simulationPanel) {
        return;
    }
    simulationPanel.classList.toggle("active", show);
    simulationPanel.classList.toggle("minimized", !show);
    simulationPanel.setAttribute("aria-hidden", show ? "false" : "true");
}

function createDefaultClinicEntries(totalAffiliated) {
    const clinicCount = Math.max(1, Number(totalAffiliated) || 1);
    return Array.from({ length: clinicCount }, (_, index) => ({
        clinicId: index + 1,
        status: "Status: Monitoring",
        report: "Report: Awaiting incident data",
        affected: false,
        critical: false,
        cured: false
    }));
}

function ensureNationState(nation) {
    const clinicCount = Math.max(1, Number(nation.total_affiliated) || 1);
    const existing = nationSimulationState.get(nation.id);

    if (existing) {
        if (existing.clinics.length !== clinicCount) {
            const nextClinics = createDefaultClinicEntries(clinicCount);
            for (let index = 0; index < Math.min(existing.clinics.length, clinicCount); index += 1) {
                nextClinics[index] = { ...nextClinics[index], ...existing.clinics[index] };
            }
            existing.clinics = nextClinics;
        }
        nationSimulationState.set(nation.id, existing);
        return existing;
    }

    const initialState = {
        progress: 0,
        cardData: `Total affiliated clinics: ${nation.total_affiliated}`,
        clinics: createDefaultClinicEntries(clinicCount)
    };
    nationSimulationState.set(nation.id, initialState);
    return initialState;
}

function renderClinicCards(nation, nationState) {
    const clinicList = document.getElementById("clinic-list");
    const clinicState = nationState || ensureNationState(nation);

    clinicList.innerHTML = "";

    clinicState.clinics.forEach((clinicEntry) => {
        const clinicCard = document.createElement("div");
        clinicCard.className = "clinic-card";
        if (clinicEntry.affected) {
            clinicCard.classList.add("affected");
        }
        if (clinicEntry.critical) {
            clinicCard.classList.add("critical");
        }
        if (clinicEntry.cured) {
            clinicCard.classList.add("cured");
        }

        clinicCard.dataset.clinicId = String(clinicEntry.clinicId);
        clinicCard.innerHTML = `
            <h3 class="clinic-title">Clinic - ${clinicEntry.clinicId}</h3>
            <p class="clinic-status">${clinicEntry.status}</p>
            <p class="clinic-report">${clinicEntry.report}</p>
        `;
        clinicList.appendChild(clinicCard);
    });
}

function renderNationCard(nation) {
    const nationState = ensureNationState(nation);
    document.getElementById("card-title-text").innerText = nation.name;
    document.getElementById("card-flag").src = nation.image;
    document.getElementById("card-flag").alt = `${nation.name} flag`;
    document.getElementById("card-data").innerText = nationState.cardData;

    const progressBar = document.getElementById("report-progress");
    const progressValue = document.getElementById("progress-value");
    const progress = Math.max(0, Math.min(100, Number(nationState.progress) || 0));
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    if (progressValue) {
        progressValue.innerText = `${progress}%`;
    }

    renderClinicCards(nation, nationState);
}

function updateSimulationState(stateText) {
    const stateNode = document.getElementById("simulation-state");
    if (stateNode) {
        stateNode.innerText = stateText;
    }
}

function updateSimulationLog(text) {
    const logNode = document.getElementById("simulation-log");
    if (logNode) {
        logNode.innerText = text;
    }
}

function setSimulationLogAlert(isAlert) {
    const logNode = document.getElementById("simulation-log");
    if (logNode) {
        logNode.classList.toggle("alert-red", Boolean(isAlert));
    }
}

function hideBodyNotification() {
    const notificationContainer = document.getElementById("body-notification");
    const alertPanel = notificationContainer?.querySelector(".error-alert");
    if (!notificationContainer || !alertPanel) {
        return;
    }

    notificationContainer.setAttribute("hidden", "hidden");
    notificationContainer.style.display = "none";
    alertPanel.classList.remove("soft-alert");

    if (notificationHideHandle) {
        window.clearTimeout(notificationHideHandle);
        notificationHideHandle = null;
    }
}

function playNotificationBeep(isCritical = false) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        return;
    }

    if (!notificationAudioContext) {
        notificationAudioContext = new AudioContextClass();
    }

    if (notificationAudioContext.state === "suspended") {
        notificationAudioContext.resume().catch(() => {});
    }

    const oscillator = notificationAudioContext.createOscillator();
    const gainNode = notificationAudioContext.createGain();
    const now = notificationAudioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(isCritical ? 920 : 740, now);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (isCritical ? 0.28 : 0.18));

    oscillator.connect(gainNode);
    gainNode.connect(notificationAudioContext.destination);

    oscillator.start(now);
    oscillator.stop(now + (isCritical ? 0.3 : 0.2));
}

function notifyUser(message, isCritical = false) {
    setSimulationLogAlert(isCritical);
    updateSimulationLog(message);

    const notificationContainer = document.getElementById("body-notification");
    const headingNode = document.getElementById("notification-heading");
    const listNode = document.getElementById("notification-list");
    const alertPanel = notificationContainer?.querySelector(".error-alert");

    if (!notificationContainer || !headingNode || !listNode || !alertPanel) {
        return;
    }

    const lines = String(message)
        .split(/\n|\|/)
        .map((line) => line.trim())
        .filter(Boolean);

    const title = isCritical ? "BioShield • Critical Alert" : "BioShield • Notification";
    headingNode.innerText = title;

    listNode.innerHTML = "";
    const contentLines = lines.length ? lines : [message];
    contentLines.forEach((line) => {
        const li = document.createElement("li");
        li.innerText = line;
        listNode.appendChild(li);
    });

    alertPanel.classList.toggle("soft-alert", !isCritical);
    notificationContainer.removeAttribute("hidden");
    notificationContainer.style.display = "flex";
    playNotificationBeep(isCritical);

    if (notificationHideHandle) {
        window.clearTimeout(notificationHideHandle);
    }

    if (!isCritical) {
        notificationHideHandle = window.setTimeout(() => {
            hideBodyNotification();
        }, 5000);
    }
}

function updateDeploymentBadge() {
    const badge = document.getElementById("deployment-badge");
    const pill = document.getElementById("deployment-pill");
    const text = `Deployed countries: ${nodes.length}/${AUTO_NODE_MINIMUM}`;
    const isReady = hasMinimumDeployment();

    if (badge) {
        badge.innerText = text;
        badge.classList.toggle("ready", isReady);
    }

    if (pill) {
        pill.innerText = text;
        pill.classList.toggle("ready", isReady);
    }
}

function hasMinimumDeployment() {
    return nodes.length >= AUTO_NODE_MINIMUM;
}

function parseClinicSelection(inputText) {
    const selected = new Set();
    const raw = (inputText || "").trim();

    if (!raw) {
        return selected;
    }

    const tokens = raw.split(",").map((token) => token.trim()).filter(Boolean);
    tokens.forEach((token) => {
        if (token.includes("-")) {
            const [startText, endText] = token.split("-").map((part) => part.trim());
            const start = Number(startText);
            const end = Number(endText);
            if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start) {
                for (let value = start; value <= end; value += 1) {
                    selected.add(value);
                }
            }
        } else {
            const value = Number(token);
            if (Number.isFinite(value) && value > 0) {
                selected.add(value);
            }
        }
    });

    return selected;
}

function getWaveTargets() {
    const primarySelect = document.getElementById("target-nation");
    const checklist = document.getElementById("target-nations-list");
    const targetIds = new Set();

    if (primarySelect?.value) {
        targetIds.add(primarySelect.value);
    }

    if (checklist) {
        const selectedCheckboxes = checklist.querySelectorAll("input[data-node-id]:checked");
        selectedCheckboxes.forEach((checkbox) => targetIds.add(checkbox.dataset.nodeId));
    }

    if (!targetIds.size) {
        targetIds.add(mainNode.id);
    }

    return [...targetIds]
        .map((id) => nodes.find((node) => node.id === id))
        .filter(Boolean);
}

function renderAdditionalNationChecklist() {
    const container = document.getElementById("target-nations-list");
    const countNode = document.getElementById("additional-target-count");
    const primaryId = document.getElementById("target-nation")?.value;

    if (!container) {
        return;
    }

    const previouslySelected = new Set(
        [...container.querySelectorAll("input[data-node-id]:checked")].map((checkbox) => checkbox.dataset.nodeId)
    );

    const secondaryNodes = nodes.filter((node) => node.id !== primaryId);

    container.innerHTML = secondaryNodes.length
        ? secondaryNodes.map((node) => `
            <label class="target-nation-item">
                <input type="checkbox" data-node-id="${node.id}" ${previouslySelected.has(node.id) ? "checked" : ""}>
                <span>${node.name} • ${node.total_affiliated} clinics</span>
            </label>
        `).join("")
        : `<div class="simulation-log">No additional nations available yet.</div>`;

    const selectedCount = container.querySelectorAll("input[data-node-id]:checked").length;
    if (countNode) {
        countNode.innerText = `${selectedCount} selected`;
    }
}

function renderClinicTargetGrid() {
    const grid = document.getElementById("clinic-target-grid");
    if (!grid) {
        return;
    }

    const previousValues = new Map();
    [...grid.querySelectorAll("input[data-nation-id]")].forEach((input) => {
        previousValues.set(input.dataset.nationId, input.value);
    });

    const targets = getWaveTargets();

    grid.innerHTML = targets
        .map((nation) => {
            const previous = previousValues.get(nation.id) || "";
            return `
                <div class="clinic-target-row">
                    <p class="clinic-target-title">${nation.name} clinics (1-${nation.total_affiliated})</p>
                    <input class="clinic-target-input" data-nation-id="${nation.id}" type="text" placeholder="all clinics or e.g. 1,2,5-7" value="${previous}">
                </div>
            `;
        })
        .join("");
}

function parseClinicTargetsByNation(targetNations) {
    const inputMap = new Map();
    document.querySelectorAll("#clinic-target-grid input[data-nation-id]").forEach((input) => {
        inputMap.set(input.dataset.nationId, parseClinicSelection(input.value));
    });

    return targetNations.map((nation) => {
        const clinicMax = Math.max(1, Number(nation.total_affiliated) || 1);
        const rawSelection = inputMap.get(nation.id) || new Set();
        const targeted = rawSelection.size
            ? new Set([...rawSelection].filter((clinicId) => clinicId <= clinicMax))
            : new Set(Array.from({ length: clinicMax }, (_, index) => index + 1));
        return { nation, targeted };
    });
}

function computeClinicMetrics(nation, clinicId, diseaseLabel) {
    const identity = `${nation.id}:${clinicId}:${diseaseLabel}`;
    let hash = 7;
    for (let index = 0; index < identity.length; index += 1) {
        hash = (hash * 31 + identity.charCodeAt(index)) % 100000;
    }

    const load = 35 + (hash % 56);
    const infectedShare = 22 + (hash % 64);
    const transmission = 1 + ((hash % 16) / 10);
    const criticalRate = 5 + (hash % 28);
    const riskScore = Math.round((load * 0.35) + (infectedShare * 0.4) + (criticalRate * 0.25));
    const isCritical = infectedShare >= 65 || transmission >= 2 || criticalRate >= 22;

    return {
        clinicId,
        load,
        infectedShare,
        transmission,
        criticalRate,
        riskScore,
        isCritical
    };
}

function detectPandemic(planEntries) {
    let totalClinics = 0;
    let criticalClinics = 0;
    let transmissionSum = 0;

    planEntries.forEach((entry) => {
        entry.metrics.forEach((metric) => {
            totalClinics += 1;
            transmissionSum += metric.transmission;
            if (metric.isCritical) {
                criticalClinics += 1;
            }
        });
    });

    const avgTransmission = totalClinics ? (transmissionSum / totalClinics) : 0;
    const criticalShare = totalClinics ? (criticalClinics / totalClinics) : 0;
    const isPandemic = criticalShare >= 0.45 || avgTransmission >= 1.8 || criticalClinics >= 3;

    return { isPandemic, avgTransmission, criticalClinics, totalClinics };
}

function renderTargetNationOptions() {
    const select = document.getElementById("target-nation");
    if (!select) {
        return;
    }

    const current = select.value || selectedNation?.id || mainNode.id;
    const options = nodes
        .map((node) => `<option value="${node.id}">${node.name} • ${node.total_affiliated} clinics</option>`)
        .join("");

    select.innerHTML = options;
    select.value = current;
    renderAdditionalNationChecklist();
    renderClinicTargetGrid();
}

function syncTargetNationSelect(nodeId) {
    const select = document.getElementById("target-nation");
    if (select) {
        select.value = nodeId;
    }
    renderAdditionalNationChecklist();
    renderClinicTargetGrid();
}

function setResolveButtonVisibility(isVisible) {
    const button = document.getElementById("resolve-pandemic");
    if (button) {
        button.hidden = !isVisible;
    }
}

function resolvePandemicAlert() {
    pandemicActive = false;
    setResolveButtonVisibility(false);
    setSimulationLogAlert(false);
    updateSimulationState("Resolved");
    updateSimulationLog("Pandemic alert resolved. You can run a new spread cycle.");
    nationSimulationState.forEach((state) => {
        state.clinics = state.clinics.map((clinic) => ({ ...clinic, critical: false }));
    });
    if (selectedNation) {
        renderNationCard(selectedNation);
    }
}

function renderDiseaseCatalog(query = "") {
    const diseaseList = document.getElementById("disease-list");
    const diseaseCount = document.getElementById("disease-count");
    const normalizedQuery = query.trim().toLowerCase();

    if (!selectedDisease && diseases.length) {
        selectedDisease = diseases[0];
    }

    if (diseaseCount) {
        diseaseCount.innerText = `${diseases.length} loaded`;
    }

    const filteredDiseases = diseases
        .filter((disease) => disease.toLowerCase().includes(normalizedQuery));

    diseaseList.innerHTML = filteredDiseases.length
        ? filteredDiseases.map((disease) => {
            const activeClass = disease === selectedDisease ? " active" : "";
            return `<button type="button" class="disease-btn${activeClass}" data-disease="${disease.replace(/"/g, "&quot;")}">${disease}</button>`;
        }).join("")
        : `<div class="simulation-log">No diseases match your filter.</div>`;
    
    // FIX 3: Removed inline event listener binding to prevent memory leaks. 
    // Handled via event delegation in DOMContentLoaded instead.
}

function stopActiveWave() {
    if (waveHandle) {
        window.clearInterval(waveHandle);
        waveHandle = null;
    }

    waveInProgress = false;
    isCirculating = false;
    circulationPhase = 0;
    if (activeWaveResolver) {
        activeWaveResolver();
        activeWaveResolver = null;
    }
    canvas.selectAll("line").classed("circulating-link", false);
    updateSimulationState(simulationRunning ? "Running" : "Idle");
}

function applyClinicStatusPhase(phase, spreadPlan, diseaseLabel, progressPercent, reportText = "") {
    spreadPlan.forEach((planEntry) => {
        const nation = planEntry.nation;
        const nationState = ensureNationState(nation);
        const clinicCount = Math.max(1, Number(nation.total_affiliated) || 1);
        const metricMap = new Map(planEntry.metrics.map((metric) => [metric.clinicId, metric]));
        const nextClinics = [];

        for (let clinicNumber = 1; clinicNumber <= clinicCount; clinicNumber += 1) {
            const targeted = planEntry.targeted.has(clinicNumber);
            const metric = metricMap.get(clinicNumber);
            let status = `Status: Clinic - ${clinicNumber} monitoring`;
            let report = "Report: Clinic synchronized with global monitoring network.";
            let affected = false;
            let critical = false;
            let cured = false;

            if (targeted && metric) {
                affected = phase !== "cure";
                critical = metric.isCritical && phase !== "stabilize" && phase !== "cure";

                if (phase === "detect") {
                    status = `Status: Clinic - ${clinicNumber} detected ${diseaseLabel}`;
                    report = `Report: Positivity ${metric.infectedShare}% | Occupancy ${metric.load}% | R-index ${metric.transmission.toFixed(1)}.`;
                } else if (phase === "coordinate") {
                    status = `Status: Clinic - ${clinicNumber} coordinating with all clinics`;
                    report = `Report: Shared resources online. Critical care load ${metric.criticalRate}% | Risk score ${metric.riskScore}.`;
                } else if (phase === "suppress") {
                    status = `Status: Clinic - ${clinicNumber} suppressing spread`;
                    report = `Report: Multi-nation tracing and treatment routing active.`;
                } else if (phase === "stabilize") {
                    status = `Status: Clinic - ${clinicNumber} stabilized`;
                    report = reportText || `Report: ${diseaseLabel} contained by coordinated clinic network.`;
                } else if (phase === "cure") {
                    status = `Status: Clinic - ${clinicNumber} cured`;
                    report = `Report: Abnormal spread cured through global clinic collaboration.`;
                    affected = false;
                    critical = false;
                    cured = true;
                }
            }

            nextClinics.push({
                clinicId: clinicNumber,
                status,
                report,
                affected,
                critical,
                cured
            });
        }

        nationState.clinics = nextClinics;
        nationState.progress = progressPercent;
        if (reportText && (phase === "stabilize" || phase === "cure")) {
            nationState.cardData = reportText;
        }
        nationSimulationState.set(nation.id, nationState);
    });

    if (selectedNation) {
        renderNationCard(selectedNation);
    }
}

function cureAbnormalSpread(spreadPlan, diseaseLabel) {
    const cureReport = `Cure report: ${diseaseLabel} abnormal spread detected and cured by collaborative clinic response.`;
    applyClinicStatusPhase("cure", spreadPlan, diseaseLabel, 100, cureReport);
    updateSimulationState("Cured");
    setSimulationLogAlert(false);
    updateSimulationLog(`Abnormal spread was detected and automatically cured through all connected clinics.`);
}

async function animateDiseaseWave() {
    if (waveInProgress) {
        return;
    }

    const targetNations = getWaveTargets();
    if (!targetNations.length) {
        updateSimulationLog("No target nation selected.");
        return;
    }

    const targetNation = targetNations[0];
    selectedNation = targetNation;
    openCard(targetNation);

    const progressBar = document.getElementById("report-progress");
    const progressValue = document.getElementById("progress-value");
    const diseaseLabel = selectedDisease || diseases[0] || "Unknown disease";
    const spreadPlan = parseClinicTargetsByNation(targetNations).map(({ nation, targeted }) => {
        const metrics = [...targeted].map((clinicId) => computeClinicMetrics(nation, clinicId, diseaseLabel));
        return { nation, targeted, metrics };
    });

    if (waveHandle) {
        window.clearInterval(waveHandle);
    }

    waveInProgress = true;
    isCirculating = true;
    circulationPhase = 0;
    canvas.selectAll("line").classed("circulating-link", true);

    updateSimulationState("Active");
    pandemicActive = false;
    setResolveButtonVisibility(false);
    setSimulationLogAlert(false);
    updateSimulationLog(`Spreading ${diseaseLabel} to ${targetNations.map((nation) => nation.name).join(", ")}.`);
    document.getElementById("card-data").innerText = `Spread scope: ${diseaseLabel} in ${targetNations.length} nation(s). Monitoring ${spreadPlan.reduce((sum, entry) => sum + entry.metrics.length, 0)} targeted clinic(s).`;

    let progress = 0;
    applyClinicStatusPhase("detect", spreadPlan, diseaseLabel, 0);

    waveHandle = window.setInterval(() => {
        progress += 4;
        circulationPhase += 1;
        const clampedProgress = Math.min(progress, 100);
        progressBar.style.width = `${clampedProgress}%`;
        progressValue.innerText = `${clampedProgress}%`;

        // FIX 1: Manually trigger the CSS class update so the animation doesn't freeze when D3 settles
        canvas.selectAll("line")
            .classed("circulating-link", (d) => isCirculating && isLinkCirculating(d));

        if (clampedProgress < 25) {
            applyClinicStatusPhase("detect", spreadPlan, diseaseLabel, clampedProgress);
        } else if (clampedProgress < 55) {
            applyClinicStatusPhase("coordinate", spreadPlan, diseaseLabel, clampedProgress);
        } else if (clampedProgress < 85) {
            applyClinicStatusPhase("suppress", spreadPlan, diseaseLabel, clampedProgress);
        } else {
            const finalReport = `Final report: ${diseaseLabel} processed in ${targetNations.length} nation(s). Targeted clinics have updated telemetry and response states.`;
            applyClinicStatusPhase("stabilize", spreadPlan, diseaseLabel, clampedProgress, finalReport);
            document.getElementById("card-data").innerText = finalReport;
        }

        if (clampedProgress >= 100) {
            window.clearInterval(waveHandle);
            waveHandle = null;
            waveInProgress = false;
            isCirculating = false;
            const resolver = activeWaveResolver;
            activeWaveResolver = null;
            canvas.selectAll("line").classed("circulating-link", false);

            const pandemicStatus = detectPandemic(spreadPlan);
            if (pandemicStatus.isPandemic) {
                const redAlert = `🚨 PANDEMIC ALERT: ${pandemicStatus.criticalClinics}/${pandemicStatus.totalClinics} clinics are critical (avg transmission ${pandemicStatus.avgTransmission.toFixed(2)}).`;
                pandemicActive = true;
                setResolveButtonVisibility(true);
                notifyUser(redAlert, true);
                updateSimulationState("Pandemic");
                cureAbnormalSpread(spreadPlan, diseaseLabel);
            } else {
                pandemicActive = false;
                setResolveButtonVisibility(false);
                updateSimulationState("Completed");
                setSimulationLogAlert(false);
                updateSimulationLog(`Completed one spread cycle: ${diseaseLabel} across ${targetNations.length} nation(s).`);
            }

            simulationRunning = false;
            if (resolver) {
                resolver();
            }
        }
    }, 120);

    await new Promise((resolve) => {
        activeWaveResolver = resolve;
    });
}

function startSimulation() {
    if (!diseases.length) {
        updateSimulationLog("Disease catalog is still loading.");
        return;
    }

    if (!hasMinimumDeployment()) {
        notifyUser("You need at least 4 countries deployed for the simulation to work.", true);
        return;
    }

    simulationRunning = true;
    showSimulationPanel(true);
    renderClinicTargetGrid();
    updateSimulationState("Running");
    pandemicActive = false;
    setResolveButtonVisibility(false);
    setSimulationLogAlert(false);
    updateSimulationLog("Simulation engaged. One spread cycle will run for the selected targets.");

    if (!selectedDisease) {
        selectedDisease = diseases[0];
        renderDiseaseCatalog(document.getElementById("disease-search").value);
    }

    if (!waveInProgress) {
        animateDiseaseWave();
    }
}

function stopSimulation() {
    simulationRunning = false;
    stopActiveWave();
    pandemicActive = false;
    setResolveButtonVisibility(false);
    updateSimulationState("Stopped");
    setSimulationLogAlert(false);
    updateSimulationLog("Simulation halted. All circulation loops are offline.");
}

async function loadAppData() {
    const [nationResponse, diseaseResponse] = await Promise.all([
        fetch("/api/nations"),
        fetch("/api/diseases")
    ]);

    if (!nationResponse.ok) {
        throw new Error(`Failed loading nations: ${nationResponse.status}`);
    }

    if (!diseaseResponse.ok) {
        throw new Error(`Failed loading diseases: ${diseaseResponse.status}`);
    }

    nations = await nationResponse.json();
    diseases = await diseaseResponse.json();
}

function addRandomNation(shouldRelink = true) {
    if (!nations.length) {
        return;
    }

    const nation = nations[Math.floor(Math.random() * nations.length)];
    nodeCounter += 1;

    const newNode = {
        ...nation,
        id: `node-${nodeCounter}`,
        x: mainNode.x + (Math.random() - 0.5) * 80,
        y: mainNode.y + (Math.random() - 0.5) * 80
    };

    nodes.push(newNode);

    simulation.nodes(nodes);
    if (shouldRelink) {
        rebuildDistributedLinks();
    }
    renderTargetNationOptions();
    updateDeploymentBadge();
    simulation.alpha(0.9).restart();
}

function addLinkIfMissing(nextLinks, seenKeys, sourceId, targetId, backbone = false) {
    if (sourceId === targetId) {
        return;
    }
    const linkKey = [sourceId, targetId].sort().join("::");
    if (seenKeys.has(linkKey)) {
        return;
    }
    seenKeys.add(linkKey);
    nextLinks.push({ source: sourceId, target: targetId, backbone });
}

function rebuildDistributedLinks() {
    const nextLinks = [];
    const seenKeys = new Set();
    const peripheralNodes = nodes.filter((node) => node.id !== mainNode.id);

    peripheralNodes.forEach((node) => {
        addLinkIfMissing(nextLinks, seenKeys, mainNode.id, node.id, true);
    });

    if (peripheralNodes.length > 1) {
        for (let index = 0; index < peripheralNodes.length; index += 1) {
            const currentNode = peripheralNodes[index];
            const nextNode = peripheralNodes[(index + 1) % peripheralNodes.length];
            addLinkIfMissing(nextLinks, seenKeys, currentNode.id, nextNode.id, false);
        }
    }

    if (peripheralNodes.length > 3) {
        for (let index = 0; index < peripheralNodes.length; index += 2) {
            const currentNode = peripheralNodes[index];
            const chordNode = peripheralNodes[(index + 2) % peripheralNodes.length];
            addLinkIfMissing(nextLinks, seenKeys, currentNode.id, chordNode.id, false);
        }
    }

    links.length = 0;
    nextLinks.forEach((link) => links.push(link));
    
    // FIX 4: Explicitly re-declare the ID accessor to prevent D3 internal object mismatch crashes
    simulation.force("link").id((d) => d.id).links(links);
}

function ensureDistributedNetwork(minimumNodes = AUTO_NODE_MINIMUM) {
    if (!nations.length) {
        return;
    }

    while (nodes.length < minimumNodes) {
        addRandomNation(false);
    }

    rebuildDistributedLinks();
}

function wait(milliseconds) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds);
    });
}

async function hideLoaderWhenReady(loaderNode, startedAt, minimumVisibleMs = 2000) {
    if (!loaderNode) {
        return;
    }

    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, minimumVisibleMs - elapsed);
    if (remaining > 0) {
        await wait(remaining);
    }

    loaderNode.classList.add("hidden");
    await wait(500);
    loaderNode.style.display = "none";
}

document.addEventListener("DOMContentLoaded", async () => {
    const loaderStartedAt = Date.now();
    const loaderNode = document.querySelector(".loader-container");
    const secondWorldSection = document.getElementById("second-world");

    updateCanvasSize();

    hideBodyNotification();

    const addNationButton = document.getElementById("nation_add");
    const globalStartButton = document.getElementById("radar-start");
    const globalStopButton = document.getElementById("radar-stop");
    const minimizeSimulationButton = document.getElementById("minimize-simulation");
    const closeCardButton = document.getElementById("close-card");
    const runAlertButton = document.getElementById("run-alert");
    const startSimulationButton = document.getElementById("start-simulation");
    const stopSimulationButton = document.getElementById("stop-simulation");
    const spreadSelectedButton = document.getElementById("spread-selected");
    const resolvePandemicButton = document.getElementById("resolve-pandemic");
    const notificationCloseButton = document.getElementById("notification-close");
    const targetNationSelect = document.getElementById("target-nation");
    const targetNationList = document.getElementById("target-nations-list");
    const clinicTargetGrid = document.getElementById("clinic-target-grid");
    const diseaseSearch = document.getElementById("disease-search");
    const diseaseList = document.getElementById("disease-list"); // For event delegation

    if (closeCardButton) {
        closeCardButton.addEventListener("click", closeCard);
    }

    if (startSimulationButton) {
        startSimulationButton.addEventListener("click", startSimulation);
    }

    if (stopSimulationButton) {
        stopSimulationButton.addEventListener("click", stopSimulation);
    }

    if (globalStartButton) {
        globalStartButton.addEventListener("click", startSimulation);
    }

    if (globalStopButton) {
        globalStopButton.addEventListener("click", stopSimulation);
    }

    if (minimizeSimulationButton) {
        minimizeSimulationButton.addEventListener("click", () => showSimulationPanel(false));
    }

    if (runAlertButton) {
        runAlertButton.addEventListener("click", async () => {
            showSimulationPanel(true);
            await animateDiseaseWave();
        });
    }

    if (spreadSelectedButton) {
        spreadSelectedButton.addEventListener("click", async () => {
            showSimulationPanel(true);
            await animateDiseaseWave();
        });
    }

    if (targetNationSelect) {
        targetNationSelect.addEventListener("change", () => {
            const target = nodes.find((node) => node.id === targetNationSelect.value) || mainNode;
            openCard(target);
            renderAdditionalNationChecklist();
            renderClinicTargetGrid();
            updateSimulationLog(`Target nation set to ${target.name}.`);
        });
    }

    if (targetNationList) {
        targetNationList.addEventListener("change", () => {
            renderClinicTargetGrid();
            const names = [...targetNationList.querySelectorAll("input[data-node-id]:checked")]
                .map((checkbox) => checkbox.parentElement?.textContent?.trim().split(" • ")[0])
                .filter(Boolean);
            const countNode = document.getElementById("additional-target-count");
            if (countNode) {
                countNode.innerText = `${names.length} selected`;
            }
            updateSimulationLog(names.length ? `Additional targets: ${names.join(", ")}.` : "No additional nations selected.");
        });
    }

    if (clinicTargetGrid) {
        clinicTargetGrid.addEventListener("input", () => {
            updateSimulationLog("Clinic target map updated.");
        });
    }

    if (resolvePandemicButton) {
        resolvePandemicButton.addEventListener("click", resolvePandemicAlert);
    }

    if (notificationCloseButton) {
        notificationCloseButton.addEventListener("click", hideBodyNotification);
    }

    if (diseaseSearch) {
        diseaseSearch.addEventListener("input", (event) => {
            renderDiseaseCatalog(event.target.value);
        });
    }

    if (secondWorldSection && "IntersectionObserver" in window) {
        const worldObserver = new IntersectionObserver(
            (entries) => {
                const [entry] = entries;
                document.body.classList.toggle("world-two-active", entry.isIntersecting);
            },
            {
                threshold: 0.25
            }
        );
        worldObserver.observe(secondWorldSection);
    }

    // FIX 3: Event Delegation for Disease List
    if (diseaseList) {
        diseaseList.addEventListener("click", (event) => {
            if (event.target.tagName === "BUTTON" && event.target.classList.contains("disease-btn")) {
                selectedDisease = event.target.dataset.disease;
                renderDiseaseCatalog(document.getElementById("disease-search")?.value || "");
                updateSimulationLog(`Selected disease: ${selectedDisease}`);
            }
        });
    }

    try {
        await loadAppData();
    } catch (error) {
        console.error(error);
        updateSimulationLog("Data failed to load. Please refresh the page.");
    }

    renderTargetNationOptions();
    renderDiseaseCatalog();
    ensureNationState(mainNode);
    renderNationCard(mainNode);
    updateDeploymentBadge();
    setResolveButtonVisibility(false);
    showSimulationPanel(false);

    if (addNationButton) {
        addNationButton.addEventListener("click", addRandomNation);
    }

    simulation.alpha(0.6).restart();

    await hideLoaderWhenReady(loaderNode, loaderStartedAt, 2000);
});

window.addEventListener("resize", updateCanvasSize);