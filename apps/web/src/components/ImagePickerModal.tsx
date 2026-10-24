import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, RotateCw, Trash2, Upload, Check, Library } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Modal, Spinner } from './ui';

export type ImagePickerProps = {
  open: boolean;
  title: string;
  currentImage?: string | null;
  category?: 'tools' | 'stock' | 'employees' | 'profiles';
  defaultFacingMode?: 'user' | 'environment';
  onClose: () => void;
  onSelect: (imageUrl: string | null) => void | Promise<void>;
};

/**
 * Compresse une image côté client via HTML Canvas à une résolution optimale (640x640 max, JPEG 85%)
 */
async function compressImageFile(file: File | Blob, maxWidth = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ImagePickerModal({
  open,
  title,
  currentImage,
  category = 'tools',
  defaultFacingMode = 'environment',
  onClose,
  onSelect,
}: ImagePickerProps) {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'gallery'>('camera');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(defaultFacingMode);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<{ photo_path: string; name: string; category: string }[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialisation à l'ouverture
  useEffect(() => {
    if (open) {
      setPreview(currentImage || null);
      setActiveTab('camera');
      setCameraError(null);
    } else {
      stopCamera();
    }
  }, [open, currentImage]);

  // Chargement de la galerie pour mutualisation de photos d'un même groupe
  useEffect(() => {
    if (open && activeTab === 'gallery' && (category === 'tools' || category === 'stock')) {
      setGalleryLoading(true);
      const endpoint = category === 'tools' ? '/api/images/gallery/tools' : '/api/images/gallery/stock';
      api<{ photos: { photo_path: string; name: string; category: string }[] }>(endpoint)
        .then((res) => setGalleryPhotos(res.photos || []))
        .catch(() => setGalleryPhotos([]))
        .finally(() => setGalleryLoading(false));
    }
  }, [open, activeTab, category]);

  // Gestion du flux caméra
  useEffect(() => {
    if (!open || activeTab !== 'camera' || preview) {
      stopCamera();
      return;
    }

    let isMounted = true;
    async function startCamera() {
      stopCamera();
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        if (!isMounted) return;
        setCameraError("Impossible d'accéder à la caméra. Vérifiez les autorisations de votre navigateur.");
      }
    }

    void startCamera();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [open, activeTab, facingMode, preview]);

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  // Prise de vue depuis la caméra
  function takeSnapshot() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPreview(dataUrl);
    stopCamera();
  }

  // Importation fichier
  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressImageFile(file);
      setPreview(dataUrl);
    } catch {
      // Ignoré
    } finally {
      setBusy(false);
    }
  }

  // Validation finale & téléversement
  async function handleValidate() {
    if (!preview) {
      await onSelect(null);
      onClose();
      return;
    }

    // Si c'est déjà une URL existante du serveur
    if (preview.startsWith('/api/') || preview.startsWith('/files/')) {
      await onSelect(preview);
      onClose();
      return;
    }

    // Sinon téléversement du base64 vers l'API
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; url: string }>('/api/images/upload', {
        method: 'POST',
        body: JSON.stringify({ dataUrl: preview, prefix: category }),
      });
      await onSelect(res.url);
      onClose();
    } catch (err) {
      // Fallback : sauvegarde directe du dataUrl si problème réseau
      await onSelect(preview);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {preview ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={15} className="text-red" />}
              onClick={() => {
                setPreview(null);
                if (activeTab === 'camera') {
                  setFacingMode(defaultFacingMode);
                }
              }}
            >
              Supprimer la photo
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              icon={busy ? <Spinner /> : <Check size={16} />}
              onClick={() => void handleValidate()}
            >
              {busy ? 'Enregistrement…' : 'Valider'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Navigation des 3 modes */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-paper p-1 border border-line">
          <button
            type="button"
            onClick={() => {
              setActiveTab('camera');
              setPreview(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              activeTab === 'camera'
                ? 'bg-surface text-ink shadow-xs border border-line'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Camera size={14} /> Caméra
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('upload');
              stopCamera();
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              activeTab === 'upload'
                ? 'bg-surface text-ink shadow-xs border border-line'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Upload size={14} /> Fichier / Galerie
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('gallery');
              stopCamera();
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
              activeTab === 'gallery'
                ? 'bg-surface text-ink shadow-xs border border-line'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Library size={14} /> Même groupe
          </button>
        </div>

        {/* PRÉVISUALISATION D'UNE PHOTO VALIDÉE / SÉLECTIONNÉE */}
        {preview ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-2">
            <div className="relative overflow-hidden rounded-2xl border-2 border-line-strong bg-paper shadow-md">
              <img
                src={preview}
                alt="Aperçu sélection"
                className="h-64 w-64 object-cover sm:h-72 sm:w-72"
              />
              <span className="absolute bottom-2 right-2 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-bold text-ink shadow-xs backdrop-blur-xs">
                Prêt à enregistrer
              </span>
            </div>
            <p className="text-xs text-ink-soft">
              Vous pouvez valider cette photo ou cliquer sur « Reprendre » ci-dessous.
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCw size={14} />}
              onClick={() => {
                setPreview(null);
                if (activeTab === 'camera') {
                  setFacingMode(defaultFacingMode);
                }
              }}
            >
              Reprendre / Choisir une autre
            </Button>
          </div>
        ) : (
          <>
            {/* MODE 1 : CAMÉRA EN DIRECT */}
            {activeTab === 'camera' && (
              <div className="space-y-3">
                <div className="relative aspect-square max-h-72 w-full overflow-hidden rounded-2xl bg-black shadow-inner flex items-center justify-center">
                  {cameraError ? (
                    <div className="p-6 text-center text-xs text-white/80">
                      <p className="font-semibold text-red mb-2">{cameraError}</p>
                      <p>Basculez sur l’onglet « Fichier / Galerie » pour sélectionner une photo de votre appareil.</p>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="h-full w-full object-cover"
                      />
                      {/* Viseur / Réticule d'alignement */}
                      <div className="pointer-events-none absolute inset-6 rounded-xl border border-white/40 border-dashed" />

                      {/* Bouton bascule Caméra Avant / Arrière */}
                      <button
                        type="button"
                        onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
                        className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur-xs hover:bg-black/80 transition-all"
                        title="Inverser la caméra"
                      >
                        <RotateCw size={16} />
                      </button>
                    </>
                  )}
                </div>

                {!cameraError && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={takeSnapshot}
                      className="group relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-amber bg-surface shadow-lg transition-transform active:scale-95"
                    >
                      <span className="h-11 w-11 rounded-full bg-amber group-hover:scale-105 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* MODE 2 : IMPORT DEPUIS GALERIE / FICHIER */}
            {activeTab === 'upload' && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line-strong bg-paper p-8 text-center cursor-pointer hover:border-amber hover:bg-amber-wash/20 transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void handleFileChange(e)}
                  className="hidden"
                />
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface border border-line shadow-xs group-hover:scale-105 transition-transform">
                  <ImageIcon size={26} className="text-amber" />
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">Cliquez ou glissez une image ici</p>
                  <p className="text-xs text-ink-faint mt-1">Formats acceptés : JPG, PNG, WEBP (Max 10 Mo)</p>
                </div>
                <Button variant="secondary" size="sm" icon={<Upload size={14} />}>
                  Parcourir mes photos
                </Button>
              </div>
            )}

            {/* MODE 3 : CHOISIR PARMI LA PHOTOTHÈQUE D'ATELIER (MÊME GROUPE) */}
            {activeTab === 'gallery' && (
              <div className="space-y-2">
                <p className="text-xs text-ink-soft">
                  Sélectionnez une image existante pour l’associer à ce matériel (ex. même référence pour un lot de tournevis, clous, ou rabots) :
                </p>

                {galleryLoading ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-xs text-ink-soft">
                    <Spinner /> Chargement de la photothèque d’atelier…
                  </div>
                ) : galleryPhotos.length === 0 ? (
                  <div className="rounded-xl border border-line bg-paper p-6 text-center text-xs text-ink-faint">
                    Aucune photo enregistrée dans la photothèque pour le moment.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
                    {galleryPhotos.map((item, idx) => (
                      <button
                        key={`${item.photo_path}-${idx}`}
                        type="button"
                        onClick={() => setPreview(item.photo_path)}
                        className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left hover:border-amber hover:shadow-xs transition-all"
                      >
                        <div className="aspect-square w-full overflow-hidden bg-paper">
                          <img
                            src={item.photo_path}
                            alt={item.name}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div className="p-1.5">
                          <p className="truncate text-[11px] font-bold text-ink">{item.name}</p>
                          <p className="truncate text-[10px] text-ink-faint">{item.category}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
