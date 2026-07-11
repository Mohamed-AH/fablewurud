/**
 * Search Page Client JS
 * Handles audio playback and feedback submission
 */

(function() {
  'use strict';

  // Audio Player
  const audioPlayer = document.getElementById('audioPlayer');
  let currentPlayingBtn = null;

  // Helper function to get play button text based on size
  function getPlayText(isSmall) {
    return isSmall ? 'تشغيل' : 'تشغيل من هنا';
  }

  function getPauseText() {
    return 'إيقاف مؤقت';
  }

  // Play buttons
  document.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const audioUrl = this.dataset.audioUrl;
      const startTime = parseFloat(this.dataset.startTime) || 0;
      const isSmall = this.classList.contains('play-btn-small');

      if (!audioUrl) return;

      // If clicking the same button that's playing, pause it
      if (currentPlayingBtn === this && !audioPlayer.paused) {
        audioPlayer.pause();
        this.classList.remove('playing');
        this.innerHTML = '<span class="play-icon">&#9658;</span> ' + getPlayText(isSmall);
        currentPlayingBtn = null;
        return;
      }

      // Reset previous playing button
      if (currentPlayingBtn) {
        const prevIsSmall = currentPlayingBtn.classList.contains('play-btn-small');
        currentPlayingBtn.classList.remove('playing');
        currentPlayingBtn.innerHTML = '<span class="play-icon">&#9658;</span> ' + getPlayText(prevIsSmall);
      }

      // Load and play new audio
      audioPlayer.src = audioUrl;
      audioPlayer.currentTime = startTime;
      audioPlayer.play()
        .then(() => {
          this.classList.add('playing');
          this.innerHTML = '<span class="play-icon">&#10074;&#10074;</span> ' + getPauseText();
          currentPlayingBtn = this;
        })
        .catch(err => {
          console.error('Audio playback error:', err);
          alert('حدث خطأ أثناء تشغيل الصوت');
        });
    });
  });

  // Handle audio ended
  audioPlayer.addEventListener('ended', function() {
    if (currentPlayingBtn) {
      const isSmall = currentPlayingBtn.classList.contains('play-btn-small');
      currentPlayingBtn.classList.remove('playing');
      currentPlayingBtn.innerHTML = '<span class="play-icon">&#9658;</span> ' + getPlayText(isSmall);
      currentPlayingBtn = null;
    }
  });

  // Deep dive expand/collapse functionality
  document.querySelectorAll('.deep-dive-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const targetId = this.dataset.target;
      const targetEl = document.getElementById(targetId);

      if (!targetEl) return;

      const isExpanded = targetEl.classList.contains('open');

      if (isExpanded) {
        targetEl.classList.remove('open');
        this.classList.remove('expanded');
      } else {
        targetEl.classList.add('open');
        this.classList.add('expanded');
      }
    });
  });

  // Feedback functionality
  const feedbackSection = document.getElementById('feedbackSection');
  if (feedbackSection && window.searchLogId) {
    const feedbackToggle = document.getElementById('feedbackToggle');
    const feedbackPanel = document.getElementById('feedbackPanel');
    const feedbackBtns = document.querySelectorAll('.feedback-btn');
    const feedbackComment = document.getElementById('feedbackComment');
    const feedbackSubmit = document.getElementById('feedbackSubmit');

    let selectedRelevant = null;

    // Toggle feedback panel
    feedbackToggle.addEventListener('click', function() {
      feedbackPanel.classList.toggle('open');
    });

    // Relevance button selection
    feedbackBtns.forEach(btn => {
      btn.addEventListener('click', function() {
        // Remove active from all buttons
        feedbackBtns.forEach(b => b.classList.remove('active'));

        // Add active to clicked button
        this.classList.add('active');
        selectedRelevant = this.dataset.relevant;

        // Enable submit button
        feedbackSubmit.disabled = false;
      });
    });

    // Submit feedback
    feedbackSubmit.addEventListener('click', async function() {
      if (selectedRelevant === null) return;

      this.disabled = true;
      this.textContent = 'جاري الإرسال...';

      try {
        const response = await fetch('/search/feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            logId: window.searchLogId,
            relevant: selectedRelevant,
            comment: feedbackComment.value.trim()
          })
        });

        if (response.ok) {
          // Hide feedback section on success
          feedbackSection.innerHTML = `
            <div class="feedback-success" style="
              background: #E8F5E9;
              color: #2E7D32;
              padding: 1rem;
              border-radius: 8px;
              text-align: center;
            ">
              شكراً لك على تقييمك!
            </div>
          `;
        } else {
          const data = await response.json();
          alert(data.error || 'حدث خطأ أثناء حفظ التقييم');
          this.disabled = false;
          this.textContent = 'إرسال التقييم';
        }
      } catch (error) {
        console.error('Feedback error:', error);
        alert('حدث خطأ أثناء حفظ التقييم');
        this.disabled = false;
        this.textContent = 'إرسال التقييم';
      }
    });
  }
})();
