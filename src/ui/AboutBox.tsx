/**
 * The about box — click the product name in the header. Release number
 * (injected from package.json by vite), one-line description, license and
 * copyright summary. The whole app's UI text lives in App/panels; this is
 * the one place that states what the software IS.
 */

import { useEffect } from 'react';

export function AboutBox(props: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  return (
    <div className="modal-overlay">
      <div className="modal about-modal" role="dialog" aria-modal="true" aria-label="About Simple.CAM">
        <h2>
          <span className="brand-name">
            Simple<span className="cam">.CAM</span>
          </span>
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={props.onClose}>
            ✕
          </button>
        </h2>
        <p className="hint">release {__APP_VERSION__}</p>
        <div className="about-text">
          <p>
            Open-source CAM for the Carvera CNC: load a model, build toolpath
            operations, export G-code — then use the{' '}
            <a
              href="https://github.com/Carvera-Community/Carvera_Controller"
              target="_blank"
              rel="noreferrer"
            >
              Carvera Community Controller
            </a>{' '}
            to upload the g-code and run the job.
          </p>
          <p>
            © 2026 Alice Mitchell. Released under the MIT License — see
            LICENSE in the source distribution. Third-party components are
            MIT/BSD/Apache/LGPL only; no GPL/AGPL code is included.
          </p>
          <p className="hint">
            An independent project, not affiliated with or endorsed by
            Makera. “Carvera” and “Makera” are trademarks of their
            respective owners.
          </p>
          <p className="about-source">
            <a href="https://github.com/amethystalice23/Simple.CAM" target="_blank" rel="noreferrer">
              github.com/amethystalice23/Simple.CAM
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}