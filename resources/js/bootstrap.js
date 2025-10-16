import axios from 'axios';
window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
window.axios.defaults.withCredentials = true;

const tokenElement = document.head.querySelector('meta[name="csrf-token"]');
if (tokenElement) {
    window.axios.defaults.headers.common['X-CSRF-TOKEN'] = tokenElement.content;
} else {
    console.warn('CSRF token not found: uploads and POST requests may fail.');
}
