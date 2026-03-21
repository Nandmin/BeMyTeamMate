import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class FooterComponent {
  currentYear = new Date().getFullYear();
}
