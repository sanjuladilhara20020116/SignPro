import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import SignaturePad from 'signature_pad';
import * as pdfjsLib from 'pdfjs-dist';

import {
  DocumentService,
  UploadPdfResponse
} from '../../core/services/document.service';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

interface SignaturePlacement {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  previewPageWidth: number;
  previewPageHeight: number;
}

@Component({
  selector: 'app-sign-pdf',
  imports: [CommonModule, RouterLink],
  templateUrl: './sign-pdf.html',
  styleUrl: './sign-pdf.scss'
})
export class SignPdf implements AfterViewInit, OnDestroy {
  @ViewChild('pdfPagesContainer') pdfPagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('signatureCanvas') signatureCanvas!: ElementRef<HTMLCanvasElement>;

  private documentService = inject(DocumentService);
  private cdr = inject(ChangeDetectorRef);

  private signaturePad?: SignaturePad;
  private signatureElement: HTMLElement | null = null;

  selectedFile: File | null = null;
  uploadedPdf: UploadPdfResponse | null = null;

  isDragging = false;
  isUploading = false;
  uploadProgress = 0;

  pdfLoading = false;
  totalPages = 0;
  selectedPage = 1;

  signatureDataUrl = '';
  signatureSaved = false;

  uploadedSignatureFileName = '';
  backgroundRemoveTolerance = 55;

  placement: SignaturePlacement | null = null;

  errorMessage = '';
  successMessage = '';

  signingPdf = false;
  signerName = localStorage.getItem('fullName') || '';
  addDateStamp = true;

  ngAfterViewInit() {
    this.initializeSignaturePad();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;

    const file = event.dataTransfer?.files?.[0];

    if (file) {
      this.handleSelectedFile(file);
    }
  }

  onFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      this.handleSelectedFile(file);
    }

    input.value = '';
  }

  handleSelectedFile(file: File) {
    this.clearMessages();
    this.removePlacedSignature();

    this.uploadedPdf = null;
    this.uploadProgress = 0;
    this.totalPages = 0;
    this.selectedPage = 1;

    const isPdfByType = file.type === 'application/pdf';
    const isPdfByName = file.name.toLowerCase().endsWith('.pdf');

    if (!isPdfByType && !isPdfByName) {
      this.clearSelectedFile();
      this.errorMessage = 'Only PDF files are allowed.';
      return;
    }

    const maxSize = 20 * 1024 * 1024;

    if (file.size > maxSize) {
      this.clearSelectedFile();
      this.errorMessage = 'PDF file size must be less than 20MB.';
      return;
    }

    this.selectedFile = file;

    setTimeout(() => {
      this.renderPdf(file);
    });
  }

  async renderPdf(file: File) {
    if (!this.pdfPagesContainer) {
      setTimeout(() => this.renderPdf(file));
      return;
    }

    this.pdfLoading = true;
    this.totalPages = 0;
    this.pdfPagesContainer.nativeElement.innerHTML = '';

    try {
      const arrayBuffer = await file.arrayBuffer();

      const loadingTask = (pdfjsLib as any).getDocument({
        data: arrayBuffer
      });

      const pdf = await loadingTask.promise;
      this.totalPages = pdf.numPages;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);

        const viewport = page.getViewport({
          scale: 1.35
        });

        const outputScale = window.devicePixelRatio || 1;

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'rendered-page';

        const pageShell = document.createElement('div');
        pageShell.className = 'pdf-page-shell';
        pageShell.dataset['pageNumber'] = pageNumber.toString();

        const pageBadge = document.createElement('div');
        pageBadge.className = 'page-badge';
        pageBadge.innerText = `Page ${pageNumber}`;

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas';

        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Canvas context is not available.');
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const renderContext: any = {
          canvasContext: context,
          viewport
        };

        if (outputScale !== 1) {
          renderContext.transform = [
            outputScale,
            0,
            0,
            outputScale,
            0,
            0
          ];
        }

        pageShell.appendChild(pageBadge);
        pageShell.appendChild(canvas);
        pageWrapper.appendChild(pageShell);

        pageShell.addEventListener('click', (event) => {
          const target = event.target as HTMLElement;

          if (target.closest('.signature-overlay')) {
            return;
          }

          this.selectPage(pageNumber);
        });

        this.pdfPagesContainer.nativeElement.appendChild(pageWrapper);

        await page.render(renderContext).promise;
      }

      this.highlightSelectedPage();
    } catch (error) {
      console.error(error);
      this.errorMessage = 'Could not preview this PDF. Please try another file.';
    } finally {
      this.pdfLoading = false;
      this.cdr.detectChanges();
    }
  }

  uploadPdf() {
    if (!this.selectedFile) {
      this.errorMessage = 'Please select a PDF file first.';
      return;
    }

    this.clearMessages();

    this.isUploading = true;
    this.uploadProgress = 0;

    this.documentService.uploadPdf(this.selectedFile).subscribe({
      next: (event: HttpEvent<UploadPdfResponse>) => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total || this.selectedFile?.size || 1;
          this.uploadProgress = Math.round((event.loaded / total) * 100);
        }

        if (event.type === HttpEventType.Response) {
          this.uploadedPdf = event.body || null;
          this.successMessage = 'PDF uploaded successfully. Now create and place your signature.';
          this.isUploading = false;
          this.uploadProgress = 100;
        }
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'PDF upload failed.';
        this.isUploading = false;
        this.uploadProgress = 0;
      }
    });
  }

  initializeSignaturePad() {
    const canvas = this.signatureCanvas.nativeElement;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    canvas.width = canvasWidth * ratio;
    canvas.height = canvasHeight * ratio;

    const context = canvas.getContext('2d');

    if (context) {
      context.scale(ratio, ratio);
    }

    this.signaturePad = new SignaturePad(canvas, {
      minWidth: 1.2,
      maxWidth: 3,
      penColor: '#111827',
      backgroundColor: 'rgba(255,255,255,0)'
    });
  }

  clearSignature() {
    this.signaturePad?.clear();
    this.signatureDataUrl = '';
    this.signatureSaved = false;
    this.uploadedSignatureFileName = '';
    this.removePlacedSignature();
    this.clearMessages();
  }

  saveSignature() {
    this.clearMessages();

    if (!this.signaturePad || this.signaturePad.isEmpty()) {
      this.errorMessage = 'Please draw your signature first.';
      return;
    }

    this.signatureDataUrl = this.signaturePad.toDataURL('image/png');
    this.signatureSaved = true;
    this.uploadedSignatureFileName = '';
    this.successMessage = 'Signature saved as PNG. Now select a PDF page and place it.';
  }

  onSignatureImageInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      this.handleSignatureImageFile(file);
    }

    input.value = '';
  }

  async handleSignatureImageFile(file: File) {
    this.clearMessages();

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
      this.errorMessage = 'Only PNG, JPG, JPEG, or WEBP signature images are allowed.';
      return;
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      this.errorMessage = 'Signature image size must be less than 5MB.';
      return;
    }

    try {
      this.removePlacedSignature();

      const cleanedImage = await this.removeImageBackground(file);

      this.signaturePad?.clear();
      this.signatureDataUrl = cleanedImage;
      this.signatureSaved = true;
      this.uploadedSignatureFileName = file.name;

      this.successMessage = 'Signature image uploaded and background removed successfully.';
      this.cdr.detectChanges();
    } catch (error) {
      console.error(error);
      this.errorMessage = 'Could not process signature image. Please try another image.';
    }
  }

  private removeImageBackground(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        try {
          const maxCanvasWidth = 900;
          const scale = image.width > maxCanvasWidth ? maxCanvasWidth / image.width : 1;

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d', {
            willReadFrequently: true
          });

          if (!context) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Canvas context not available.'));
            return;
          }

          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);

          context.drawImage(image, 0, 0, canvas.width, canvas.height);

          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          const cornerColors = this.getCornerColors(data, canvas.width, canvas.height);
          const bgColor = this.getAverageColor(cornerColors);

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a === 0) {
              continue;
            }

            const brightness = (r + g + b) / 3;
            const colorDistance = this.colorDistance(
              r,
              g,
              b,
              bgColor.r,
              bgColor.g,
              bgColor.b
            );

            const isWhiteBackground = r > 225 && g > 225 && b > 225;
            const isNearPaperBackground =
              colorDistance < this.backgroundRemoveTolerance && brightness > 170;

            if (isWhiteBackground || isNearPaperBackground) {
              data[i + 3] = 0;
            } else if (
              brightness > 210 &&
              colorDistance < this.backgroundRemoveTolerance + 25
            ) {
              data[i + 3] = Math.max(0, a - 160);
            }
          }

          context.putImageData(imageData, 0, 0);

          URL.revokeObjectURL(objectUrl);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image load failed.'));
      };

      image.src = objectUrl;
    });
  }

  private getCornerColors(
    data: Uint8ClampedArray,
    width: number,
    height: number
  ): Array<{ r: number; g: number; b: number }> {
    const points = [
      { x: 0, y: 0 },
      { x: width - 1, y: 0 },
      { x: 0, y: height - 1 },
      { x: width - 1, y: height - 1 }
    ];

    return points.map((point) => {
      const index = (point.y * width + point.x) * 4;

      return {
        r: data[index],
        g: data[index + 1],
        b: data[index + 2]
      };
    });
  }

  private getAverageColor(colors: Array<{ r: number; g: number; b: number }>) {
    const total = colors.reduce(
      (sum, color) => {
        sum.r += color.r;
        sum.g += color.g;
        sum.b += color.b;
        return sum;
      },
      { r: 0, g: 0, b: 0 }
    );

    return {
      r: total.r / colors.length,
      g: total.g / colors.length,
      b: total.b / colors.length
    };
  }

  private colorDistance(
    r1: number,
    g1: number,
    b1: number,
    r2: number,
    g2: number,
    b2: number
  ): number {
    return Math.sqrt(
      Math.pow(r1 - r2, 2) +
        Math.pow(g1 - g2, 2) +
        Math.pow(b1 - b2, 2)
    );
  }

  selectPageFromInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const pageNumber = Number(input.value);

    this.selectPage(pageNumber);
  }

  selectPage(pageNumber: number) {
    if (pageNumber < 1 || pageNumber > this.totalPages) {
      return;
    }

    const pageChanged = this.selectedPage !== pageNumber;

    this.selectedPage = pageNumber;
    this.highlightSelectedPage();

    if (pageChanged && this.signatureElement) {
      this.placeSignatureOnSelectedPage();
    }

    this.cdr.detectChanges();
  }

  placeSignatureOnSelectedPage() {
    this.clearMessages();

    if (!this.selectedFile || this.totalPages === 0) {
      this.errorMessage = 'Please select and preview a PDF first.';
      return;
    }

    if (!this.signatureSaved || !this.signatureDataUrl) {
      this.errorMessage = 'Please draw, save, or upload your signature first.';
      return;
    }

    const pageShell = this.getSelectedPageShell();

    if (!pageShell) {
      this.errorMessage = 'Selected PDF page is not ready yet.';
      return;
    }

    this.removePlacedSignature();

    const pageWidth = pageShell.clientWidth;
    const pageHeight = pageShell.clientHeight;

    const initialWidth = Math.min(220, Math.max(140, pageWidth * 0.28));
    const initialHeight = Math.round(initialWidth * 0.38);

    const initialX = Math.max(20, pageWidth - initialWidth - 45);
    const initialY = Math.max(20, pageHeight - initialHeight - 70);

    const overlay = document.createElement('div');
    overlay.className = 'signature-overlay';

    overlay.style.left = `${initialX}px`;
    overlay.style.top = `${initialY}px`;
    overlay.style.width = `${initialWidth}px`;
    overlay.style.height = `${initialHeight}px`;

    const image = document.createElement('img');
    image.src = this.signatureDataUrl;
    image.alt = 'Placed Signature';
    image.draggable = false;

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'signature-resize-handle';

    overlay.appendChild(image);
    overlay.appendChild(resizeHandle);

    overlay.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    overlay.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const target = event.target as HTMLElement;

      if (target.classList.contains('signature-resize-handle')) {
        this.startResize(event, overlay, pageShell);
      } else {
        this.startDrag(event, overlay, pageShell);
      }
    });

    pageShell.appendChild(overlay);

    this.signatureElement = overlay;
    this.updatePlacementFromElement();

    this.successMessage = 'Signature placed. Drag it or resize from the bottom-right handle.';
    this.cdr.detectChanges();
  }

  removePlacedSignature() {
    if (this.signatureElement) {
      this.signatureElement.remove();
      this.signatureElement = null;
    }

    this.placement = null;
  }

  private startDrag(
    event: PointerEvent,
    element: HTMLElement,
    pageShell: HTMLElement
  ) {
    const startMouseX = event.clientX;
    const startMouseY = event.clientY;

    const startX = parseFloat(element.style.left || '0');
    const startY = parseFloat(element.style.top || '0');

    const moveHandler = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();

      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;

      let newX = startX + deltaX;
      let newY = startY + deltaY;

      const maxX = pageShell.clientWidth - element.offsetWidth;
      const maxY = pageShell.clientHeight - element.offsetHeight;

      newX = this.clamp(newX, 0, maxX);
      newY = this.clamp(newY, 0, maxY);

      element.style.left = `${newX}px`;
      element.style.top = `${newY}px`;

      this.updatePlacementFromElement();
    };

    const upHandler = () => {
      document.removeEventListener('pointermove', moveHandler);
      document.removeEventListener('pointerup', upHandler);
      document.body.classList.remove('signature-dragging');
    };

    document.body.classList.add('signature-dragging');
    document.addEventListener('pointermove', moveHandler);
    document.addEventListener('pointerup', upHandler);
  }

  private startResize(
    event: PointerEvent,
    element: HTMLElement,
    pageShell: HTMLElement
  ) {
    const startMouseX = event.clientX;
    const startMouseY = event.clientY;

    const startWidth = element.offsetWidth;
    const startHeight = element.offsetHeight;

    const startX = parseFloat(element.style.left || '0');
    const startY = parseFloat(element.style.top || '0');

    const moveHandler = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();

      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;

      let newWidth = startWidth + deltaX;
      let newHeight = startHeight + deltaY;

      newWidth = this.clamp(newWidth, 80, pageShell.clientWidth - startX);
      newHeight = this.clamp(newHeight, 35, pageShell.clientHeight - startY);

      element.style.width = `${newWidth}px`;
      element.style.height = `${newHeight}px`;

      this.updatePlacementFromElement();
    };

    const upHandler = () => {
      document.removeEventListener('pointermove', moveHandler);
      document.removeEventListener('pointerup', upHandler);
      document.body.classList.remove('signature-dragging');
    };

    document.body.classList.add('signature-dragging');
    document.addEventListener('pointermove', moveHandler);
    document.addEventListener('pointerup', upHandler);
  }

  private updatePlacementFromElement() {
    if (!this.signatureElement) {
      this.placement = null;
      return;
    }

    const pageShell = this.getSelectedPageShell();

    if (!pageShell) {
      this.placement = null;
      return;
    }

    const x = parseFloat(this.signatureElement.style.left || '0');
    const y = parseFloat(this.signatureElement.style.top || '0');

    this.placement = {
      pageNumber: this.selectedPage,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(this.signatureElement.offsetWidth),
      height: Math.round(this.signatureElement.offsetHeight),
      previewPageWidth: Math.round(pageShell.clientWidth),
      previewPageHeight: Math.round(pageShell.clientHeight)
    };

    this.cdr.detectChanges();
  }

  private getSelectedPageShell(): HTMLElement | null {
    if (!this.pdfPagesContainer) {
      return null;
    }

    return this.pdfPagesContainer.nativeElement.querySelector(
      `.pdf-page-shell[data-page-number="${this.selectedPage}"]`
    );
  }

  private highlightSelectedPage() {
    if (!this.pdfPagesContainer) {
      return;
    }

    const pages = this.pdfPagesContainer.nativeElement.querySelectorAll('.pdf-page-shell');

    pages.forEach((page) => {
      const pageNumber = Number((page as HTMLElement).dataset['pageNumber']);
      page.classList.toggle('selected-pdf-page', pageNumber === this.selectedPage);
    });
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  onSignerNameChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.signerName = input.value;
  }

  onDateStampChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.addDateStamp = input.checked;
  }

  downloadSignedPdf() {
    this.clearMessages();

    if (!this.selectedFile) {
      this.errorMessage = 'Please select a PDF first.';
      return;
    }

    if (!this.signatureDataUrl) {
      this.errorMessage = 'Please create and save your signature first.';
      return;
    }

    if (!this.placement) {
      this.errorMessage = 'Please place the signature on the PDF first.';
      return;
    }

    this.signingPdf = true;

    this.documentService.signPdf({
      file: this.selectedFile,
      signatureBase64: this.signatureDataUrl,
      pageNumber: this.placement.pageNumber,
      x: this.placement.x,
      y: this.placement.y,
      width: this.placement.width,
      height: this.placement.height,
      previewPageWidth: this.placement.previewPageWidth,
      previewPageHeight: this.placement.previewPageHeight,
      signerName: this.signerName,
      addDateStamp: this.addDateStamp
    }).subscribe({
      next: (response) => {
        const blob = response.body;

        if (!blob) {
          this.errorMessage = 'Signed PDF was empty.';
          this.signingPdf = false;
          return;
        }

        const fileName = this.getFileNameFromResponse(response) || 'signed-document.pdf';

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        link.click();

        window.URL.revokeObjectURL(url);

        this.successMessage = 'Signed PDF downloaded successfully.';
        this.signingPdf = false;
      },
      error: async (err) => {
        this.signingPdf = false;

        if (err.error instanceof Blob) {
          const text = await err.error.text();

          try {
            const json = JSON.parse(text);
            this.errorMessage = json.message || 'PDF signing failed.';
          } catch {
            this.errorMessage = text || 'PDF signing failed.';
          }

          return;
        }

        this.errorMessage = err.error?.message || 'PDF signing failed.';
      }
    });
  }

  private getFileNameFromResponse(response: any): string | null {
    const contentDisposition = response.headers.get('content-disposition');

    if (!contentDisposition) {
      return null;
    }

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);

    if (utf8Match) {
      return decodeURIComponent(utf8Match[1]);
    }

    const normalMatch = contentDisposition.match(/filename="?([^"]+)"?/);

    return normalMatch ? normalMatch[1] : null;
  }

  clearSelectedFile() {
    this.selectedFile = null;
    this.uploadedPdf = null;
    this.uploadProgress = 0;
    this.totalPages = 0;
    this.selectedPage = 1;
    this.pdfLoading = false;
    this.isUploading = false;
    this.signingPdf = false;

    this.removePlacedSignature();

    if (this.pdfPagesContainer) {
      this.pdfPagesContainer.nativeElement.innerHTML = '';
    }
  }

  clearMessages() {
    this.errorMessage = '';
    this.successMessage = '';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  ngOnDestroy() {
    this.signaturePad?.off();
    this.removePlacedSignature();
    document.body.classList.remove('signature-dragging');
  }
}