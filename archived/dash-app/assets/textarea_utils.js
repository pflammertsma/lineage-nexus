window.addEventListener('DOMContentLoaded', () => {
    const setupEventListeners = () => {
        const textarea = document.getElementById('user-input');
        const sendButton = document.getElementById('send-btn');

        if (textarea && !textarea.hasAttribute('data-textarea-listeners')) {
            textarea.setAttribute('data-textarea-listeners', 'true');

            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight + 2) + 'px';
            });

            textarea.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    sendButton?.click();
                }
            });
        }

        if (sendButton && !sendButton.hasAttribute('data-send-button-listener')) {
            sendButton.setAttribute('data-send-button-listener', 'true');

            sendButton.addEventListener('click', function() {
                setTimeout(() => {
                    if (textarea) {
                        textarea.style.height = 'auto';
                    }
                }, 50);
            });
        }
    };

    setupEventListeners();

    const observer = new MutationObserver(() => {
        setupEventListeners();
    });

    observer.observe(document.body, { childList: true, subtree: true });
});
