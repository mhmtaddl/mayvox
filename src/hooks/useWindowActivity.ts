import { useState, useEffect } from 'react';

/**
 * Pencere focus / visibility durumunu izler.
 * Inactive olduğunda document.documentElement'e 'window-inactive' class'ı ekler
 * → CSS ile tüm animasyonları durdurmak için kullanılır.
 */
export function useWindowActivity(): boolean {
  const [isActive, setIsActive] = useState(
    () => document.visibilityState === 'visible' && document.hasFocus()
  );

  useEffect(() => {
    const update = () => {
      const active = document.visibilityState === 'visible' && document.hasFocus();
      setIsActive(active);

      if (active) {
        document.documentElement.classList.remove('window-inactive');
      } else {
        document.documentElement.classList.add('window-inactive');
      }
    };

    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);

    // İlk durumu set et
    update();

    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
      document.documentElement.classList.remove('window-inactive');
    };
  }, []);

  return isActive;
}
