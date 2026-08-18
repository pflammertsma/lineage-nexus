function addCopyButtons() {
    document.querySelectorAll('.highlight-container pre, .tool-call-accordion pre').forEach(function(preElement) {
        if (preElement.querySelector('.copy-code-button')) {
            return;
        }

        var button = document.createElement('button');
        button.className = 'copy-code-button';
        button.type = 'button';
        
        const copyIcon = document.createElement('i');
        copyIcon.className = 'bi bi-clipboard';
        button.appendChild(copyIcon);

        button.addEventListener('click', function() {
            const codeElement = preElement.querySelector('code');
            const textToCopy = codeElement ? codeElement.innerText : '';

            navigator.clipboard.writeText(textToCopy).then(function() {
                const checkIcon = document.createElement('i');
                checkIcon.className = 'bi bi-check-lg';
                button.replaceChildren(checkIcon);
                setTimeout(function() {
                    button.replaceChildren(copyIcon);
                }, 2000);
            }).catch(function(err) {
                console.error('Failed to copy text: ', err);
            });
        });

        preElement.style.position = 'relative';
        preElement.appendChild(button);
    });
}

const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            addCopyButtons();
        }
    });
});

let retries = 0;
const maxRetries = 20; // 20 * 100ms = 2 seconds

function initializeObserver() {
    const targetNode = document.getElementById('chat-history');

    if (targetNode) {
        observer.observe(targetNode, { childList: true, subtree: true });
        addCopyButtons();
    } else {
        retries++;
        if (retries < maxRetries) {
            setTimeout(initializeObserver, 100);
        } else {
            console.error("Failed to find targetNode ('chat-history') after multiple retries.");
        }
    }
}

window.addEventListener('DOMContentLoaded', initializeObserver);
