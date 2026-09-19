const owner = "okanaytimur";
const repo = "md";

const fileList = document.getElementById("file-list");
const content = document.getElementById("markdown-content");
const currentFile = document.getElementById("current-file");
const searchInput = document.getElementById("search");

const menuButton = document.getElementById("menu-button");
const sidebar = document.querySelector(".sidebar");
const overlay = document.getElementById("overlay");

let markdownFiles = [];


/*
 * GitHub API
 * Repodaki .md dosyalarını otomatik bulur.
 */

async function loadFileList() {

    try {

        const response = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/`
        );

        if (!response.ok) {
            throw new Error("GitHub API erişilemedi.");
        }

        const files = await response.json();

        markdownFiles = files
            .filter(file =>
                file.type === "file" &&
                file.name.toLowerCase().endsWith(".md")
            )
            .sort((a, b) =>
                a.name.localeCompare(b.name, "tr")
            );

        renderFileList(markdownFiles);

        /*
         * URL'de dosya varsa onu aç.
         * Yoksa README.md varsa README'yi aç.
         */

        const hash = decodeURIComponent(
            window.location.hash.substring(1)
        );

        if (hash) {

            const requestedFile = markdownFiles.find(
                file => file.name === hash
            );

            if (requestedFile) {
                openMarkdown(requestedFile.name);
                return;
            }
        }

        const readme = markdownFiles.find(
            file => file.name.toLowerCase() === "readme.md"
        );

        if (readme) {
            openMarkdown(readme.name);
        } else if (markdownFiles.length > 0) {
            openMarkdown(markdownFiles[0].name);
        }

    } catch (error) {

        console.error(error);

        fileList.innerHTML = `
            <div class="loading">
                Rehberler yüklenemedi.
            </div>
        `;

        content.innerHTML = `
            <h1>Bir hata oluştu</h1>
            <p>
                GitHub üzerindeki Markdown dosyalarına erişilemedi.
            </p>
        `;
    }
}


/*
 * Sol menüyü oluştur.
 */

function renderFileList(files) {

    fileList.innerHTML = "";

    if (files.length === 0) {

        fileList.innerHTML = `
            <div class="loading">
                Markdown dosyası bulunamadı.
            </div>
        `;

        return;
    }

    files.forEach(file => {

        const link = document.createElement("a");

        link.className = "file-link";

        link.dataset.filename = file.name;

        link.textContent = cleanFileName(file.name);

        link.href = `#${encodeURIComponent(file.name)}`;

        link.addEventListener("click", () => {

            openMarkdown(file.name);

            closeMobileMenu();

        });

        fileList.appendChild(link);
    });
}


/*
 * Dosya adını daha düzgün göster.
 *
 * YENIDEN-BASLATMA.md
 * ↓
 * YENIDEN BASLATMA
 */

function cleanFileName(filename) {

    return filename
        .replace(/\.md$/i, "")
        .replace(/[-_]+/g, " ");
}


/*
 * Markdown dosyasını GitHub'dan al ve render et.
 */

async function openMarkdown(filename) {

    currentFile.textContent = cleanFileName(filename);

    content.innerHTML = `
        <div class="loading-content">
            Yükleniyor...
        </div>
    `;

    updateActiveFile(filename);

    try {

        const response = await fetch(
            `https://raw.githubusercontent.com/${owner}/${repo}/main/${encodeURIComponent(filename)}`
        );

        if (!response.ok) {
            throw new Error("Markdown dosyası bulunamadı.");
        }

        const markdown = await response.text();

        /*
         * Markdown → HTML
         */

        content.innerHTML = marked.parse(markdown);

        /*
         * Markdown içerisindeki .md linklerini
         * bizim site içerisindeki hash sistemine çevir.
         */

        fixMarkdownLinks();

        /*
         * Sayfaya başla.
         */

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    } catch (error) {

        console.error(error);

        content.innerHTML = `
            <h1>Dosya yüklenemedi</h1>
            <p>
                <code>${escapeHtml(filename)}</code>
                dosyası okunamadı.
            </p>
        `;
    }
}


/*
 * Aktif dosyayı sol menüde göster.
 */

function updateActiveFile(filename) {

    document
        .querySelectorAll(".file-link")
        .forEach(link => {

            link.classList.toggle(
                "active",
                link.dataset.filename === filename
            );

        });
}


/*
 * Markdown içerisindeki:
 *
 * [Diğer rehber](DIGER.md)
 *
 * bağlantısını:
 *
 * #DIGER.md
 *
 * haline getir.
 */

function fixMarkdownLinks() {

    content
        .querySelectorAll("a")
        .forEach(link => {

            const href = link.getAttribute("href");

            if (!href) {
                return;
            }

            if (
                href.endsWith(".md") &&
                !href.startsWith("http")
            ) {

                const filename = decodeURIComponent(
                    href.split("#")[0]
                );

                const exists = markdownFiles.some(
                    file => file.name === filename
                );

                if (exists) {

                    link.href =
                        `#${encodeURIComponent(filename)}`;

                    link.addEventListener("click", event => {

                        event.preventDefault();

                        openMarkdown(filename);

                    });
                }
            }
        });
}


/*
 * Arama
 */

searchInput.addEventListener("input", () => {

    const query = searchInput.value
        .toLowerCase()
        .trim();

    const filtered = markdownFiles.filter(file =>
        file.name.toLowerCase().includes(query)
    );

    renderFileList(filtered);
});


/*
 * URL hash değiştiğinde dosyayı aç.
 */

window.addEventListener("hashchange", () => {

    const filename = decodeURIComponent(
        window.location.hash.substring(1)
    );

    if (!filename) {
        return;
    }

    const file = markdownFiles.find(
        file => file.name === filename
    );

    if (file) {
        openMarkdown(file.name);
    }
});


/*
 * Mobil menü
 */

menuButton.addEventListener("click", () => {

    sidebar.classList.toggle("open");
    overlay.classList.toggle("active");

});


overlay.addEventListener("click", closeMobileMenu);


function closeMobileMenu() {

    sidebar.classList.remove("open");
    overlay.classList.remove("active");

}


/*
 * HTML escape
 */

function escapeHtml(text) {

    const div = document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
}


/*
 * Başlat
 */

loadFileList();