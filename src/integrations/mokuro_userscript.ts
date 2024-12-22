// @reader content-script

import { showError } from '../content/toast.js';
import { addedObserver, parseVisibleObserver } from './common.js';

try {
    const visible = parseVisibleObserver();

    const added = addedObserver('.ocr-text-container', elements => {
        for (const element of elements) visible.observe(element);
    });

    added.observe(document.body, {
        subtree: true,
        childList: true,
    });
} catch (error) {
    showError(error);
}
