const sidebar = document.getElementById('sidebar');
const closeBtn = document.getElementById('sidebar-toggle');
const openBtn = document.getElementById('floating-toggle');
const buttons = document.querySelectorAll('.nav-links button');
const iframe = document.getElementById('vis-frame');
const loader = document.getElementById('loader');

function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    
    // If the sidebar is collapsed, show the floating button. Otherwise, hide it.
    if (sidebar.classList.contains('collapsed')) {
        openBtn.classList.add('visible');
    } else {
        openBtn.classList.remove('visible');
    }
}

closeBtn.addEventListener('click', toggleSidebar);
openBtn.addEventListener('click', toggleSidebar);

buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // 1. Prevent clicking the active button again
        if (e.target.classList.contains('active')) return;

        if (e.target.classList.contains('toggle-btn')) return;

        // 2. Update the active styling
        buttons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // 3. Show the loader and hide the iframe
        // loader.classList.remove('hidden');
        // iframe.style.opacity = '0'; 

        // 4. Change the source
        const targetSrc = e.target.getAttribute('data-src');
        iframe.src = targetSrc;
    });
});

// 5. When the iframe finishes loading the new project, hide the loader
// iframe.addEventListener('load', () => {
//     loader.classList.add('hidden');
//     // Reveal the iframe smoothly (handled by CSS transition or animation)
//     iframe.style.opacity = '1';
// });