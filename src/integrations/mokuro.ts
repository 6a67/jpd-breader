// @reader content-script

import { ParseBatch, requestParse } from '../content/background_comms.js';
import { Fragment } from '../content/parse.js';
import { showError } from '../content/toast.js';
import { parseParagraphs, visibleObserver } from './common.js';

if (
    document.documentElement.outerHTML.includes('Mokuro</span>') ||
    document.documentElement.outerHTML.includes('| mokuro</title>')
) {
    try {
        const pendingBatches = new Map<HTMLElement, ParseBatch[]>();

        function handleVisibleElements(elements: HTMLElement[], visible: IntersectionObserver) {
            const batches: ParseBatch[] = [];
            for (const page of elements) {
                if (pendingBatches.get(page) !== undefined) continue;

                // Manually create fragments, since mokuro puts every line in a separate <p>aragraph
                const paragraphs = [...page.querySelectorAll('.textBox')].map(box => {
                    const fragments: Fragment[] = [];
                    let offset = 0;
                    for (const p of [...box.querySelectorAll('p')]) {
                        const text = p.firstChild as Text;
                        text.data = text.data
                            .replaceAll('．．．', '…')
                            .replaceAll('．．', '…')
                            .replaceAll('！！', '‼')
                            .replaceAll('！？', '“⁉');

                        const start = offset;
                        const length = text.length;
                        const end = (offset += length);

                        fragments.push({
                            node: text,
                            start,
                            end,
                            length,
                            hasRuby: false,
                        });
                    }
                    return fragments;
                });

                if (paragraphs.length === 0) {
                    visible.unobserve(page);
                    continue;
                }

                const [pageBatches, applied] = parseParagraphs(paragraphs);

                Promise.all(applied)
                    .then(_ => visible.unobserve(page))
                    .finally(() => {
                        pendingBatches.delete(page);
                        page.style.backgroundColor = '';
                    });

                pendingBatches.set(page, pageBatches);
                batches.push(...pageBatches);
                page.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            }
            requestParse(batches);
        }

        function handleAbortedElements(elements: HTMLElement[]) {
            for (const element of elements) {
                const batches = pendingBatches.get(element);
                if (batches) {
                    for (const { abort } of batches) {
                        abort.abort();
                    }
                    element.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
                }
            }
        }

        const visible = visibleObserver(
            elements => {
                handleVisibleElements(elements, visible);
            },
            elements => {
                handleAbortedElements(elements);
            },
        );

        // Observer for mokuro html files
        // ==============================
        for (const page of document.querySelectorAll('#pagesContainer > div')) {
            visible.observe(page);
        }
        // ==============================

        // Observer for svelte mokuro reader
        // ==============================
        function removeOldClone() {
            const oldMangaPanelClone = document.querySelector('#manga-panel-clone') as HTMLElement;
            if (oldMangaPanelClone) {
                oldMangaPanelClone.remove();
            }
        }

        const lastBackgroundImages: [string | null, string | null] = [null, null];
        let retryCount = 0;
        const maxRetryCount = 10;
        let executedOnce = false;
        let lastEventTime = 0;

        function pageChangeHandler(event: Event) {
            removeOldClone();
            if (event.timeStamp && event.timeStamp === lastEventTime) {
                console.log(event.timeStamp, lastEventTime);
                return;
            }
            lastEventTime = event.timeStamp;
            const mangaPanel = document.querySelector('#manga-panel') as HTMLElement;

            if (!mangaPanel) {
                if (retryCount >= maxRetryCount) {
                    console.error('Manga panel not found');
                    return;
                }

                retryCount++;
                setTimeout(() => {
                    pageChangeHandler(new Event(''));
                }, 100);
                return;
            }
            retryCount = 0;

            const pages = mangaPanel.querySelectorAll('div');
            const page1 = pages[0] as HTMLElement | null;
            const page2 = pages[1] as HTMLElement | null;

            if (!page1) {
                if (retryCount >= maxRetryCount) {
                    console.error('Page 1 not found');
                    return;
                }

                retryCount++;
                setTimeout(() => {
                    pageChangeHandler(new Event(''));
                }, 100);
                return;
            }
            retryCount = 0;

            const backgroundImage1 = page1.style.backgroundImage || '';

            if (lastBackgroundImages[0] === backgroundImage1) {
                if (retryCount >= maxRetryCount) {
                    console.error('Background image not changed');
                    return;
                }

                retryCount++;
                setTimeout(() => {
                    pageChangeHandler(new Event(''));
                }, 100);
            }
            retryCount = 0;

            lastBackgroundImages[0] = backgroundImage1;

            const mangaPanelClone = mangaPanel.cloneNode(true) as HTMLElement;
            mangaPanelClone.id = 'manga-panel-clone';

            mangaPanel.style.display = 'none';
            mangaPanel.after(mangaPanelClone);

            mangaPanelClone.style.display = 'flex';

            visible.observe(mangaPanelClone);

            if (!executedOnce) {
                executedOnce = true;
                document.addEventListener('mokuro-reader:page.change', event => {
                    pageChangeHandler(event);
                });

                document.addEventListener('mokuro-reader:reader.closed', event => {
                    pageChangeHandler(event);
                });
            }
        }

        // If "svelte" somewhere in the page html, assume that its the svelte reader
        if (document.documentElement.outerHTML.includes('svelte')) {
            pageChangeHandler(new Event(''));
        }
        // ==============================
    } catch (error) {
        showError(error);
    }
}
