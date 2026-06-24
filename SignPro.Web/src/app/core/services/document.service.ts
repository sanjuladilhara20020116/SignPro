import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpEvent,
  HttpResponse
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UploadPdfResponse {
  originalFileName: string;
  storedFileName: string;
  filePath: string;
  fileUrl: string;
  sizeInBytes: number;
}

export interface SignPdfRequest {
  file: File;
  signatureBase64: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  previewPageWidth: number;
  previewPageHeight: number;
  signerName: string;
  addDateStamp: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private http = inject(HttpClient);

  private apiUrl = `${environment.apiUrl}/documents`;

  uploadPdf(file: File): Observable<HttpEvent<UploadPdfResponse>> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<UploadPdfResponse>(
      `${this.apiUrl}/upload`,
      formData,
      {
        reportProgress: true,
        observe: 'events'
      }
    );
  }

  signPdf(data: SignPdfRequest): Observable<HttpResponse<Blob>> {
    const formData = new FormData();

    formData.append('file', data.file);
    formData.append('signatureBase64', data.signatureBase64);
    formData.append('pageNumber', data.pageNumber.toString());
    formData.append('x', data.x.toString());
    formData.append('y', data.y.toString());
    formData.append('width', data.width.toString());
    formData.append('height', data.height.toString());
    formData.append('previewPageWidth', data.previewPageWidth.toString());
    formData.append('previewPageHeight', data.previewPageHeight.toString());
    formData.append('signerName', data.signerName || '');
    formData.append('addDateStamp', data.addDateStamp.toString());

    return this.http.post(`${this.apiUrl}/sign`, formData, {
      responseType: 'blob',
      observe: 'response'
    });
  }
}