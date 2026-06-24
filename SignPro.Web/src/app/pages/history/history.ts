import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  DocumentHistoryItem,
  DocumentService
} from '../../core/services/document.service';

@Component({
  selector: 'app-history',
  imports: [CommonModule, RouterLink],
  templateUrl: './history.html',
  styleUrl: './history.scss'
})
export class History implements OnInit {
  private documentService = inject(DocumentService);

  documents: DocumentHistoryItem[] = [];

  loading = false;
  deletingId: number | null = null;
  downloadingId: number | null = null;

  errorMessage = '';
  successMessage = '';

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.loading = true;
    this.clearMessages();

    this.documentService.getHistory().subscribe({
      next: (documents) => {
        this.documents = documents;
        this.loading = false;
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Could not load document history.';
        this.loading = false;
      }
    });
  }

  downloadDocument(document: DocumentHistoryItem) {
    this.clearMessages();
    this.downloadingId = document.id;

    this.documentService.downloadSignedPdf(document.id).subscribe({
      next: (response) => {
        const blob = response.body;

        if (!blob) {
          this.errorMessage = 'Downloaded file was empty.';
          this.downloadingId = null;
          return;
        }

        const fileName = this.getFileNameFromResponse(response) || document.signedFileName;

        const url = window.URL.createObjectURL(blob);
        const link = window.document.createElement('a');

        link.href = url;
        link.download = fileName;
        link.click();

        window.URL.revokeObjectURL(url);

        this.successMessage = 'Signed PDF downloaded successfully.';
        this.downloadingId = null;
      },
      error: async (err) => {
        this.downloadingId = null;

        if (err.error instanceof Blob) {
          const text = await err.error.text();

          try {
            const json = JSON.parse(text);
            this.errorMessage = json.message || 'Download failed.';
          } catch {
            this.errorMessage = text || 'Download failed.';
          }

          return;
        }

        this.errorMessage = err.error?.message || 'Download failed.';
      }
    });
  }

  deleteDocument(document: DocumentHistoryItem) {
    const confirmed = confirm(
      `Delete "${document.originalFileName}" from history?`
    );

    if (!confirmed) {
      return;
    }

    this.clearMessages();
    this.deletingId = document.id;

    this.documentService.deleteSignedPdf(document.id).subscribe({
      next: (response) => {
        this.documents = this.documents.filter((item) => item.id !== document.id);
        this.successMessage = response.message || 'Document deleted successfully.';
        this.deletingId = null;
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Delete failed.';
        this.deletingId = null;
      }
    });
  }

  formatDate(value: string): string {
    const date = new Date(value);

    return date.toLocaleString();
  }

  formatFileName(name: string): string {
    if (!name) {
      return 'Signed document';
    }

    return name;
  }

  clearMessages() {
    this.errorMessage = '';
    this.successMessage = '';
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
}