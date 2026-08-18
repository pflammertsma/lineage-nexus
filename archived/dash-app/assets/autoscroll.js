window.addEventListener('DOMContentLoaded', () => {
    const setupScrollHandling = () => {
        const chatHistoryEl = document.getElementById('chat-history');
        const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');

        if (!chatHistoryEl || !scrollToBottomBtn || chatHistoryEl.hasAttribute('data-scroll-handler')) {
            return;
        }
        chatHistoryEl.setAttribute('data-scroll-handler', 'true');

        let userIsAtBottom = true; // Flag to help the observer

        const isScrolledToBottom = () => {
            const threshold = 5; // Use a small threshold
            return chatHistoryEl.scrollHeight - chatHistoryEl.scrollTop - chatHistoryEl.clientHeight <= threshold;
        };

        const scrollToBottom = (behavior) => {
            chatHistoryEl.scrollTo({
                top: chatHistoryEl.scrollHeight,
                behavior: behavior
            });
        };

        // 1. Main logic is now in the scroll handler
        chatHistoryEl.addEventListener('scroll', () => {
            userIsAtBottom = isScrolledToBottom(); // Update flag for the observer

            if (userIsAtBottom) {
                scrollToBottomBtn.style.display = 'none';
            } else {
                // Show button as soon as user scrolls up, if the content is scrollable
                if (chatHistoryEl.scrollHeight > chatHistoryEl.clientHeight) {
                    scrollToBottomBtn.style.display = 'block';
                }
            }
        });

        // 2. Button click just scrolls
        scrollToBottomBtn.addEventListener('click', () => {
            scrollToBottom('smooth');
        });

        // 3. Observer only handles auto-scrolling
        const observer = new MutationObserver(() => {
            if (userIsAtBottom) {
                scrollToBottom('auto');
            }
            // No 'else' block needed, the scroll handler manages showing the button.
        });

        observer.observe(chatHistoryEl, {
            childList: true,
            subtree: true
        });

        // Initial scroll to bottom
        setTimeout(() => scrollToBottom('auto'), 200);
    };

    setupScrollHandling();
    const mainObserver = new MutationObserver(setupScrollHandling);
    mainObserver.observe(document.body, { childList: true, subtree: true });
});
