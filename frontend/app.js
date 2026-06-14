/* ==========================================================================
   ZenTime JS Application Logic (Refactored for Backend with LocalStorage Fallback)
   ========================================================================== */

// --- Global API Configuration ---
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api';
let backendOffline = false;

// --- Global Playlists Configuration ---
const playlists = [
    { type: 'video', id: 'lTRiuFIKP54', title: 'Lofi Girl - Morning Coffee' }
];

// --- Application State ---
let totalDurationSeconds = 25 * 60; // Default Pomodoro 25 mins
let secondsRemaining = totalDurationSeconds;
let timerState = 'idle'; // 'idle', 'running', 'paused'
let timerMode = 'focus'; // 'focus', 'break', 'ielts'
let selectedSubject = 'Chưa chọn';

// Timer drift correction variables
let timerInterval = null;
let startTime = null;
let elapsedBeforePause = 0;

// Web Audio API State
let audioContext = null;
let rainNode = null;
let rainGainNode = null;

// YouTube Player State
let ytPlayer = null;
let ytPlayerReady = false;

// --- DOM Elements ---
const subjectSelect = document.getElementById('subject-select');
const newSubjectForm = document.getElementById('new-subject-form');
const newSubjectInput = document.getElementById('new-subject-input');
const saveSubjectBtn = document.getElementById('save-subject-btn');
const cancelSubjectBtn = document.getElementById('cancel-subject-btn');

const timerStateBadge = document.getElementById('timer-state-badge');
const timerCircleProgress = document.getElementById('timer-circle-progress');
const timerSubjectDisplay = document.getElementById('timer-subject-display');
const timerClock = document.getElementById('timer-clock');
const timerSublabel = document.getElementById('timer-sublabel');

const playPauseBtn = document.getElementById('play-pause-btn');
const playPauseText = document.getElementById('play-pause-text');
const resetBtn = document.getElementById('reset-btn');

const customMinutesInput = document.getElementById('custom-minutes-input');
const applyCustomBtn = document.getElementById('apply-custom-btn');

const playlistSelect = document.getElementById('playlist-select');
const ytPlayBtn = document.getElementById('yt-play-btn');
const ytPrevBtn = document.getElementById('yt-prev-btn');
const ytNextBtn = document.getElementById('yt-next-btn');
const ytVolumeSlider = document.getElementById('yt-volume');
const ytVolumePercent = document.getElementById('yt-volume-percent');
const ytCustomLink = document.getElementById('yt-custom-link');
const ytCustomName = document.getElementById('yt-custom-name');
const btnAddYt = document.getElementById('btn-add-yt');

const rainToggle = document.getElementById('rain-toggle');
const rainVolumeSlider = document.getElementById('rain-volume');
const rainVolumePercent = document.getElementById('rain-volume-percent');

const totalSessionsEl = document.getElementById('total-focus-sessions');
const totalTimeEl = document.getElementById('total-focus-time');
const subjectChartEl = document.getElementById('subject-chart');
const sessionLogsListEl = document.getElementById('session-logs-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// Circle Circumference
const CIRCLE_CIRCUMFERENCE = 597;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initCustomPlaylists();
    initSubjects();
    initTimerUI();
    initEventListeners();
    updateDashboard();
    initTabs();
});

// --- Subject Management ---
async function initSubjects() {
    try {
        const response = await fetch(`${API_BASE_URL}/subjects`);
        if (!response.ok) throw new Error('Backend response not OK');
        const subjects = await response.json();
        
        backendOffline = false;
        // Keep LocalStorage updated
        localStorage.setItem('zentime_subjects', JSON.stringify(subjects));
        renderSubjectDropdown(subjects);
    } catch (error) {
        console.warn('API Server is offline. Falling back to LocalStorage.', error);
        backendOffline = true;
        
        let savedSubjects = localStorage.getItem('zentime_subjects');
        if (!savedSubjects) {
            savedSubjects = ['Toán', 'Văn', 'Anh', 'Code', 'IELTS'];
            localStorage.setItem('zentime_subjects', JSON.stringify(savedSubjects));
        } else {
            savedSubjects = JSON.parse(savedSubjects);
        }
        renderSubjectDropdown(savedSubjects);
    }
}

function renderSubjectDropdown(subjects) {
    // Clear dynamic options (index 1 to length - 2)
    while (subjectSelect.options.length > 2) {
        subjectSelect.remove(1);
    }
    
    // Add subjects before "+ Thêm môn học..."
    subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject === 'IELTS' ? 'IELTS Speaking' : subject;
        subjectSelect.insertBefore(option, subjectSelect.lastElementChild);
    });
}

// --- Timer UI Setup ---
function initTimerUI() {
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    
    // Format timer clocks: mm:ss
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    timerClock.textContent = `${formattedMinutes}:${formattedSeconds}`;
    
    // Document Title Update for background tracking
    const modeIndicator = timerMode === 'focus' ? '🎯' : (timerMode === 'ielts' ? '🗣️' : '☕');
    document.title = `${formattedMinutes}:${formattedSeconds} ${modeIndicator} PT Time`;

    // Circular progress stroke calculation
    const progressOffset = CIRCLE_CIRCUMFERENCE * (1 - (secondsRemaining / totalDurationSeconds));
    timerCircleProgress.style.strokeDashoffset = progressOffset;
}

// --- Event Listeners ---
function initEventListeners() {
    // Subject selector
    subjectSelect.addEventListener('change', (e) => {
        if (e.target.value === 'add-new') {
            newSubjectForm.classList.remove('hidden');
            newSubjectInput.focus();
        } else {
            selectedSubject = e.target.value;
            timerSubjectDisplay.textContent = selectedSubject === 'Chưa chọn' ? 'Chưa chọn môn' : selectedSubject;
            newSubjectForm.classList.add('hidden');
        }
    });

    saveSubjectBtn.addEventListener('click', saveCustomSubject);
    newSubjectInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveCustomSubject();
    });

    cancelSubjectBtn.addEventListener('click', () => {
        newSubjectForm.classList.add('hidden');
        subjectSelect.value = selectedSubject;
    });

    // Main Timer Buttons
    playPauseBtn.addEventListener('click', toggleTimer);
    resetBtn.addEventListener('click', resetTimer);

    // Preset Selection
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.preset-btn').forEach(p => p.classList.remove('active'));
            
            const target = e.currentTarget;
            target.classList.add('active');
            
            const minutes = parseInt(target.getAttribute('data-minutes'));
            const mode = target.getAttribute('data-mode');
            
            setTimerPreset(minutes, mode);
        });
    });

    // Custom minutes apply
    applyCustomBtn.addEventListener('click', () => {
        const val = parseInt(customMinutesInput.value);
        if (val && val > 0 && val < 1000) {
            document.querySelectorAll('.preset-btn').forEach(p => p.classList.remove('active'));
            setTimerPreset(val, 'focus');
            customMinutesInput.value = '';
        }
    });

    // YouTube Audio Controllers
    ytPlayBtn.addEventListener('click', toggleYtPlay);
    ytPrevBtn.addEventListener('click', playPrevYt);
    ytNextBtn.addEventListener('click', playNextYt);
    playlistSelect.addEventListener('change', loadSelectedPlaylist);
    if (btnAddYt) btnAddYt.addEventListener('click', addCustomYtVideo);
    ytVolumeSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        ytVolumePercent.textContent = `${val}%`;
        if (ytPlayerReady && ytPlayer) {
            ytPlayer.setVolume(val);
        }
    });

    // Web Audio Rain Noise Controllers
    rainToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            rainVolumeSlider.removeAttribute('disabled');
            initRainSound();
        } else {
            rainVolumeSlider.setAttribute('disabled', 'true');
            stopRainSound();
        }
    });

    rainVolumeSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        rainVolumePercent.textContent = `${val}%`;
        setRainVolume(val);
    });

    // Clear history logs
    clearHistoryBtn.addEventListener('click', async () => {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử phiên học?')) {
            if (!backendOffline) {
                try {
                    const response = await fetch(`${API_BASE_URL}/sessions`, {
                        method: 'DELETE'
                    });
                    if (!response.ok) throw new Error('Could not delete sessions on server');
                    updateDashboard();
                    return;
                } catch (error) {
                    console.warn('Failed to delete history on backend API, clearing locally.', error);
                    backendOffline = true;
                }
            }
            
            // Local fallback
            localStorage.removeItem('zentime_history');
            updateDashboard();
        }
    });
}

async function saveCustomSubject() {
    const val = newSubjectInput.value.trim();
    if (!val) return;
    
    if (!backendOffline) {
        try {
            const response = await fetch(`${API_BASE_URL}/subjects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject: val })
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Server error');
            }
            const updatedSubjects = await response.json();
            
            localStorage.setItem('zentime_subjects', JSON.stringify(updatedSubjects));
            renderSubjectDropdown(updatedSubjects);
            
            selectedSubject = val;
            subjectSelect.value = val;
            timerSubjectDisplay.textContent = val;
            newSubjectInput.value = '';
            newSubjectForm.classList.add('hidden');
            return;
        } catch (error) {
            console.warn('Could not POST new subject to backend API. Saving locally.', error);
            backendOffline = true;
        }
    }
    
    // Local fallback
    let savedSubjects = JSON.parse(localStorage.getItem('zentime_subjects') || '[]');
    if (!savedSubjects.includes(val)) {
        savedSubjects.push(val);
        localStorage.setItem('zentime_subjects', JSON.stringify(savedSubjects));
    }
    renderSubjectDropdown(savedSubjects);
    selectedSubject = val;
    subjectSelect.value = val;
    timerSubjectDisplay.textContent = val;
    newSubjectInput.value = '';
    newSubjectForm.classList.add('hidden');
}

function setTimerPreset(minutes, mode) {
    if (timerState === 'running') {
        if (!confirm('Bạn có muốn dừng phiên hiện tại để đổi mốc thời gian?')) {
            return;
        }
        pauseTimer();
    }
    
    totalDurationSeconds = minutes * 60;
    secondsRemaining = totalDurationSeconds;
    timerMode = mode;
    elapsedBeforePause = 0;
    
    // Update Badge & UI theme colors
    updateBadgeTheme(mode);
    updateTimerDisplay();
}

function updateBadgeTheme(mode) {
    timerStateBadge.className = 'timer-badge';
    
    if (mode === 'focus') {
        timerStateBadge.textContent = 'Đang tập trung';
        timerStateBadge.classList.add('status-focus');
        timerCircleProgress.style.stroke = 'var(--neon-cyan)';
        
        // Auto select IELTS if mode is IELTS, else let user select
        if (selectedSubject === 'IELTS') {
            selectedSubject = 'Chưa chọn';
            subjectSelect.value = 'Chưa chọn';
            timerSubjectDisplay.textContent = 'Chưa chọn môn';
        }
    } else if (mode === 'break') {
        timerStateBadge.textContent = 'Nghỉ giải lao';
        timerStateBadge.classList.add('status-break');
        timerCircleProgress.style.stroke = 'var(--neon-pink)';
    } else if (mode === 'ielts') {
        timerStateBadge.textContent = 'IELTS Speaking';
        timerStateBadge.classList.add('status-focus');
        timerCircleProgress.style.stroke = 'var(--neon-cyan)';
        
        // Auto select IELTS subject
        selectedSubject = 'IELTS';
        subjectSelect.value = 'IELTS';
        timerSubjectDisplay.textContent = 'IELTS Speaking';
    }
    
    // Update button color scheme
    updateControlBtnStyles();
}

function updateControlBtnStyles() {
    playPauseBtn.className = 'btn-control btn-play';
    if (timerState === 'running') {
        if (timerMode === 'focus' || timerMode === 'ielts') {
            playPauseBtn.classList.add('focus-active');
        } else {
            playPauseBtn.classList.add('break-active');
        }
    }
}

// --- High-Precision Timer Engine ---
function toggleTimer() {
    // Resume browser audio contexts on initial interaction
    resumeAudioContexts();

    if (timerState === 'running') {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    timerState = 'running';
    startTime = Date.now();
    
    // Swap Play/Pause button icons
    playPauseBtn.querySelector('.icon-play').classList.add('hidden');
    playPauseBtn.querySelector('.icon-pause').classList.remove('hidden');
    playPauseText.textContent = 'Tạm dừng';
    
    updateControlBtnStyles();
    
    // Accurate Timer loop (compensated for background tab delays)
    timerInterval = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000) + elapsedBeforePause;
        secondsRemaining = Math.max(0, totalDurationSeconds - elapsedSeconds);
        
        updateTimerDisplay();
        
        if (secondsRemaining <= 0) {
            timerCompleted();
        }
    }, 100);
    
    timerSublabel.textContent = timerMode === 'focus' ? 'Tập trung học tập...' : (timerMode === 'break' ? 'Nghỉ ngơi thư giãn...' : 'Luyện IELTS Speaking...');
}

function pauseTimer() {
    if (timerState !== 'running') return;
    
    timerState = 'paused';
    elapsedBeforePause += Math.floor((Date.now() - startTime) / 1000);
    clearInterval(timerInterval);
    
    // Swap Play/Pause icons
    playPauseBtn.querySelector('.icon-play').classList.remove('hidden');
    playPauseBtn.querySelector('.icon-pause').classList.add('hidden');
    playPauseText.textContent = 'Tiếp tục';
    
    updateControlBtnStyles();
    timerSublabel.textContent = 'Đã tạm dừng';
}

function resetTimer() {
    clearInterval(timerInterval);
    timerState = 'idle';
    elapsedBeforePause = 0;
    secondsRemaining = totalDurationSeconds;
    
    // Restore button icons
    playPauseBtn.querySelector('.icon-play').classList.remove('hidden');
    playPauseBtn.querySelector('.icon-pause').classList.add('hidden');
    playPauseText.textContent = 'Bắt đầu';
    
    updateControlBtnStyles();
    updateTimerDisplay();
    timerSublabel.textContent = 'Sẵn sàng để bắt đầu';
}

function timerCompleted() {
    clearInterval(timerInterval);
    timerState = 'idle';
    
    // Play beautiful synthetic sound
    playAlarmSound();
    
    // Log the session if it is a study session (focus or ielts)
    if (timerMode === 'focus' || timerMode === 'ielts') {
        logSession();
    }
    
    // Auto transition logic
    let nextMode = 'break';
    let nextMinutes = 5;
    
    if (timerMode === 'break') {
        nextMode = 'focus';
        nextMinutes = 25;
        alert('Hết giờ nghỉ! Bắt đầu học tập nào.');
    } else {
        alert('Chúc mừng bạn đã hoàn thành phiên học tập!');
    }
    
    // Set to new preset
    setTimerPreset(nextMinutes, nextMode);
}

// --- Synthesis Sound (Web Audio API Chime) ---
function playAlarmSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        
        const playTone = (frequency, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency, start);
            
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.2, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(start);
            osc.stop(start + duration);
        };
        
        // Beautiful Zen chime sequence (C Major Pentatonic)
        playTone(523.25, now, 1.0);        // C5
        playTone(587.33, now + 0.15, 1.0);  // D5
        playTone(659.25, now + 0.3, 1.0);   // E5
        playTone(783.99, now + 0.45, 1.2);  // G5
        playTone(880.00, now + 0.6, 1.5);   // A5
    } catch (e) {
        console.error('Không thể sinh âm thanh báo thức: ', e);
    }
}

// --- Web Audio Rain Noise Generator ---
function initRainSound() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        // Brownian noise generation algorithm for rain sound
        const bufferSize = 2 * audioContext.sampleRate;
        const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 4.0; // Boost volume slightly
        }
        
        const noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        
        // Soft low frequency rumble
        const lowpass = audioContext.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(700, audioContext.currentTime);
        
        // Rain droplets peak frequencies
        const peakFilter = audioContext.createBiquadFilter();
        peakFilter.type = 'peaking';
        peakFilter.frequency.setValueAtTime(2200, audioContext.currentTime);
        peakFilter.Q.setValueAtTime(1.2, audioContext.currentTime);
        peakFilter.gain.setValueAtTime(5.0, audioContext.currentTime);
        
        // Gain Node
        rainGainNode = audioContext.createGain();
        const currentVol = parseFloat(rainVolumeSlider.value) / 100;
        rainGainNode.gain.setValueAtTime(currentVol * 0.4, audioContext.currentTime); // Volume scaling
        
        // Connections
        noiseSource.connect(lowpass);
        lowpass.connect(peakFilter);
        peakFilter.connect(rainGainNode);
        rainGainNode.connect(audioContext.destination);
        
        noiseSource.start(0);
        rainNode = noiseSource;
    } catch (e) {
        console.error('Không thể khởi động âm thanh mưa: ', e);
    }
}

function stopRainSound() {
    if (rainNode) {
        try {
            rainNode.stop();
        } catch (e) {}
        rainNode.disconnect();
        rainNode = null;
    }
}

function setRainVolume(val) {
    if (rainGainNode && audioContext) {
        const volumeVal = (parseFloat(val) / 100) * 0.4;
        rainGainNode.gain.setValueAtTime(volumeVal, audioContext.currentTime);
    }
}

function resumeAudioContexts() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

// --- YouTube IFrame API Control ---
// Dynamically load the YouTube IFrame Player API code asynchronously.
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('youtube-player', {
        height: '180',
        width: '240',
        videoId: playlists[0].id,
        host: 'https://www.youtube.com',
        playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            origin: window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
};

function onPlayerReady(event) {
    ytPlayerReady = true;
    document.getElementById('current-track-status').innerText = 'Sẵn sàng phát nhạc';
    ytPlayer.setVolume(parseInt(ytVolumeSlider.value));
}

function onPlayerStateChange(event) {
    const statusText = document.getElementById('current-track-status');
    const titleText = document.getElementById('current-track-title');
    const vinyl = document.querySelector('.vinyl-record');
    
    // Play icons
    const iconPlay = ytPlayBtn.querySelector('.yt-icon-play');
    const iconPause = ytPlayBtn.querySelector('.yt-icon-pause');
    
    if (event.data === YT.PlayerState.PLAYING) {
        statusText.innerText = 'Đang phát nhạc Lofi...';
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
        vinyl.classList.add('playing');
        
        // Update Title if available
        if (ytPlayer.getVideoData) {
            const data = ytPlayer.getVideoData();
            if (data && data.title) {
                titleText.innerText = data.title;
            }
        }
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        statusText.innerText = 'Tạm dừng nhạc';
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
        vinyl.classList.remove('playing');
    } else if (event.data === YT.PlayerState.BUFFERING) {
        statusText.innerText = 'Đang tải đệm YouTube...';
    } else if (event.data === YT.PlayerState.CUED || event.data === YT.PlayerState.UNSTARTED) {
        statusText.innerText = 'Sẵn sàng. Hãy nhấn Play!';
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
        vinyl.classList.remove('playing');
    }
}

function onPlayerError(event) {
    console.warn('Lỗi YouTube Iframe code:', event.data);
    document.getElementById('current-track-status').innerText = 'Lỗi phát nhạc. Đang tự chuyển tiếp...';
    playNextYt();
}

function toggleYtPlay() {
    resumeAudioContexts();
    if (!ytPlayerReady || !ytPlayer) {
        alert("Player chưa sẵn sàng! Vui lòng đợi 1-2 giây.");
        return;
    }
    
    if (typeof ytPlayer.getPlayerState !== 'function') {
        alert("API Youtube chưa load xong các hàm.");
        return;
    }

    try {
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) {
            ytPlayer.pauseVideo();
        } else {
            ytPlayer.playVideo();
            // Optional debug alert if still failing: alert("Đã gửi lệnh playVideo. State cũ: " + state);
        }
    } catch(e) {
        alert("Lỗi khi lấy state: " + e.message);
    }
}

function initCustomPlaylists() {
    const saved = localStorage.getItem('zentime_custom_playlists');
    if (saved) {
        try {
            const customArr = JSON.parse(saved);
            customArr.forEach(item => {
                playlists.push(item);
                const option = document.createElement('option');
                option.value = playlists.length - 1;
                option.textContent = item.title;
                playlistSelect.appendChild(option);
            });
        } catch(e) {
            console.error('Lỗi khi tải playlist tùy chỉnh', e);
        }
    }
}

function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : (url.length === 11 ? url : null);
}

function addCustomYtVideo() {
    if (!ytCustomLink) return;
    const link = ytCustomLink.value.trim();
    if (!link) return;
    
    const videoId = extractYouTubeId(link);
    if (!videoId) {
        alert("Link YouTube không hợp lệ! Vui lòng dán link hoặc ID hợp lệ.");
        return;
    }
    
    let customName = ytCustomName && ytCustomName.value.trim() !== '' ? ytCustomName.value.trim() : ('Nhạc tùy chỉnh (' + videoId + ')');
    const newItem = { type: 'video', id: videoId, title: customName };
    
    playlists.push(newItem);
    const newIndex = playlists.length - 1;
    
    const option = document.createElement('option');
    option.value = newIndex;
    option.textContent = customName;
    playlistSelect.appendChild(option);
    
    try {
        const saved = localStorage.getItem('zentime_custom_playlists');
        const customArr = saved ? JSON.parse(saved) : [];
        customArr.push(newItem);
        localStorage.setItem('zentime_custom_playlists', JSON.stringify(customArr));
    } catch(e) {
        console.error('Lỗi khi lưu playlist', e);
    }
    
    playlistSelect.value = newIndex;
    ytCustomLink.value = '';
    if (ytCustomName) ytCustomName.value = '';
    loadSelectedPlaylist();
}

function loadSelectedPlaylist() {
    resumeAudioContexts();
    if (!ytPlayerReady || !ytPlayer) return;
    
    const index = parseInt(playlistSelect.value);
    const item = playlists[index];
    
    document.getElementById('current-track-title').innerText = item.title;
    document.getElementById('current-track-status').innerText = 'Đang tải luồng...';
    
    if (item.type === 'live' || item.type === 'video') {
        ytPlayer.loadVideoById(item.id);
    } else {
        ytPlayer.loadPlaylist({
            listType: 'playlist',
            list: item.id,
            index: 0
        });
    }
}

function playNextYt() {
    if (!ytPlayerReady || !ytPlayer) return;
    
    const index = parseInt(playlistSelect.value);
    const item = playlists[index];
    
    if (item.type === 'playlist') {
        try {
            ytPlayer.nextVideo();
        } catch(e) {
            cyclePlaylistDropdown();
        }
    } else {
        cyclePlaylistDropdown();
    }
}

function playPrevYt() {
    if (!ytPlayerReady || !ytPlayer) return;
    
    const index = parseInt(playlistSelect.value);
    const item = playlists[index];
    
    if (item.type === 'playlist') {
        try {
            ytPlayer.previousVideo();
        } catch(e) {
            cyclePlaylistDropdown(true);
        }
    } else {
        cyclePlaylistDropdown(true);
    }
}

function cyclePlaylistDropdown(reverse = false) {
    const currentIndex = parseInt(playlistSelect.value);
    let newIndex = 0;
    
    if (reverse) {
        newIndex = (currentIndex - 1 + playlists.length) % playlists.length;
    } else {
        newIndex = (currentIndex + 1) % playlists.length;
    }
    
    playlistSelect.value = newIndex;
    loadSelectedPlaylist();
}

// --- LocalStorage Database & Chart Generator ---
async function logSession() {
    const durationMins = Math.round(totalDurationSeconds / 60);
    const newLog = {
        id: Date.now().toString(),
        subject: selectedSubject,
        duration: durationMins,
        mode: timerMode,
        timestamp: new Date().toISOString()
    };
    
    if (!backendOffline) {
        try {
            const response = await fetch(`${API_BASE_URL}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newLog)
            });
            if (!response.ok) throw new Error('API server failed to save session log');
            updateDashboard();
            return;
        } catch (error) {
            console.warn('API error when logging session. Using LocalStorage fallback.', error);
            backendOffline = true;
        }
    }
    
    // Local fallback
    const historyJson = localStorage.getItem('zentime_history') || '[]';
    const history = JSON.parse(historyJson);
    history.push(newLog);
    localStorage.setItem('zentime_history', JSON.stringify(history));
    updateDashboard();
}

async function updateDashboard() {
    let history = [];
    
    if (!backendOffline) {
        try {
            const response = await fetch(`${API_BASE_URL}/sessions`);
            if (!response.ok) throw new Error('API server response not OK');
            history = await response.json();
            
            // Keep LocalStorage updated with server logs for offline state
            localStorage.setItem('zentime_history', JSON.stringify(history));
        } catch (error) {
            console.warn('API error when getting dashboard logs. Using LocalStorage fallback.', error);
            backendOffline = true;
            
            const historyJson = localStorage.getItem('zentime_history') || '[]';
            history = JSON.parse(historyJson);
        }
    } else {
        const historyJson = localStorage.getItem('zentime_history') || '[]';
        history = JSON.parse(historyJson);
    }
    
    // Filter history for sessions completed "today" in local timezone
    const todayStr = new Date().toLocaleDateString();
    const todaySessions = history.filter(item => {
        const itemDateStr = new Date(item.timestamp).toLocaleDateString();
        return itemDateStr === todayStr;
    });
    
    // 1. Calculate general stats for today
    totalSessionsEl.textContent = todaySessions.length;
    
    const totalMinutes = todaySessions.reduce((sum, item) => sum + item.duration, 0);
    if (totalMinutes < 60) {
        totalTimeEl.textContent = `${totalMinutes} phút`;
    } else {
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        totalTimeEl.textContent = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    
    // 2. Render chart (distribution by subject)
    renderChart(todaySessions);
    
    // 3. Render recent 3 logs
    renderRecentLogs(history);
}

function renderChart(sessions) {
    subjectChartEl.innerHTML = '';
    
    if (sessions.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-chart-msg';
        emptyMsg.textContent = 'Chưa có dữ liệu học tập hôm nay.';
        subjectChartEl.appendChild(emptyMsg);
        return;
    }
    
    // Aggregate minutes by subject
    const subjectMap = {};
    sessions.forEach(session => {
        const subj = session.subject || 'Chưa chọn';
        subjectMap[subj] = (subjectMap[subj] || 0) + session.duration;
    });
    
    // Find max focus time to scale widths
    let maxTime = 0;
    Object.values(subjectMap).forEach(time => {
        if (time > maxTime) maxTime = time;
    });
    
    // Create bars HTML
    Object.entries(subjectMap).forEach(([subject, minutes]) => {
        const percent = maxTime > 0 ? (minutes / maxTime) * 100 : 0;
        
        const row = document.createElement('div');
        row.className = 'chart-row';
        
        const info = document.createElement('div');
        info.className = 'chart-row-info';
        
        const subjSpan = document.createElement('span');
        subjSpan.className = 'chart-row-subject';
        subjSpan.textContent = subject === 'IELTS' ? 'IELTS Speaking' : subject;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'chart-row-time';
        timeSpan.textContent = `${minutes}m`;
        
        info.appendChild(subjSpan);
        info.appendChild(timeSpan);
        
        const barContainer = document.createElement('div');
        barContainer.className = 'chart-bar-container';
        
        const barFill = document.createElement('div');
        barFill.className = 'chart-bar-fill';
        
        // Accent color customization based on subject or just neon cyan
        if (subject === 'IELTS') {
            barFill.style.background = 'linear-gradient(90deg, #3A86FF, #3A86FF)';
        }
        
        barContainer.appendChild(barFill);
        row.appendChild(info);
        row.appendChild(barContainer);
        
        subjectChartEl.appendChild(row);
        
        // Trigger CSS animation delay to load bars nicely
        setTimeout(() => {
            barFill.style.width = `${percent}%`;
        }, 100);
    });
}

function renderRecentLogs(history) {
    sessionLogsListEl.innerHTML = '';
    
    // Show only the last 3 logs
    const recentLogs = [...history].reverse().slice(0, 3);
    
    if (recentLogs.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.textAlign = 'center';
        emptyLi.style.color = 'var(--text-muted-dark)';
        emptyLi.style.fontSize = '0.8rem';
        emptyLi.style.padding = '8px 0';
        emptyLi.textContent = 'Chưa có hoạt động nào được ghi lại.';
        sessionLogsListEl.appendChild(emptyLi);
        return;
    }
    
    recentLogs.forEach(log => {
        const li = document.createElement('li');
        li.className = 'log-item';
        
        const leftDiv = document.createElement('div');
        leftDiv.style.display = 'flex';
        leftDiv.style.alignItems = 'center';
        leftDiv.style.gap = '8px';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'log-subject-badge';
        nameSpan.textContent = log.subject === 'IELTS' ? 'IELTS Speak' : log.subject;
        
        const modeSpan = document.createElement('span');
        modeSpan.className = `log-mode-badge ${log.mode === 'ielts' || log.mode === 'focus' ? 'log-mode-focus' : 'log-mode-break'}`;
        modeSpan.textContent = log.mode === 'ielts' ? 'IELTS' : (log.mode === 'focus' ? 'Tập trung' : 'Nghỉ ngơi');
        
        leftDiv.appendChild(nameSpan);
        leftDiv.appendChild(modeSpan);
        
        const rightDiv = document.createElement('div');
        rightDiv.className = 'log-time-details';
        
        // Format relative or standard time
        const logDate = new Date(log.timestamp);
        const timeStr = `${String(logDate.getHours()).padStart(2, '0')}:${String(logDate.getMinutes()).padStart(2, '0')}`;
        
        rightDiv.textContent = `${log.duration}m (${timeStr})`;
        
        li.appendChild(leftDiv);
        li.appendChild(rightDiv);
        
        sessionLogsListEl.appendChild(li);
    });
}

// ==========================================================================
// SPA Tab Switching Logic
// ==========================================================================

// --- Tab Initialization ---
function initTabs() {
    const navItems = document.querySelectorAll('.nav-tab-item');
    const tabWrappers = {
        'timer': document.getElementById('tab-timer'),
        'sound': document.getElementById('tab-sound'),
        'stats': document.getElementById('tab-stats')
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.getAttribute('data-tab');
            
            // Set active class on nav buttons
            navItems.forEach(n => {
                n.classList.remove('active');
                n.removeAttribute('aria-current');
            });
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
            
            // Show corresponding tab content
            Object.keys(tabWrappers).forEach(key => {
                if (key === tabName) {
                    tabWrappers[key].classList.remove('hidden');
                } else {
                    tabWrappers[key].classList.add('hidden');
                }
            });
        });
    });
}
