import { AfterViewInit, Component, ElementRef, ViewChild, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements AfterViewInit {
  @ViewChild('signVideo') signVideo!: ElementRef<HTMLVideoElement>;

  authService = inject(AuthService);

  fullName = localStorage.getItem('fullName') || 'User';
  role = localStorage.getItem('role') || 'User';

  ngAfterViewInit() {
    const video = this.signVideo.nativeElement;

    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    video.play().catch(() => {
      console.log('Autoplay blocked or video file not found.');
    });
  }

  logout() {
    this.authService.logout();
  }
}