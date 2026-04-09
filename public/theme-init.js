(function () {
  var saved = localStorage.getItem('naranjo-theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }
  // 'system' or no saved value: let CSS media query handle it
})();
