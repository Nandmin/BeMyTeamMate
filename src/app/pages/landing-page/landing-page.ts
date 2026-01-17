import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.scss',
})
export class LandingPage {
  scrollToHowItWorks() {
    const element = document.getElementById('how-it-works');
    const mainContent = document.querySelector('.main-content');
    if (element && mainContent) {
      const elementRect = element.getBoundingClientRect();
      const containerRect = mainContent.getBoundingClientRect();
      const scrollTarget = mainContent.scrollTop + (elementRect.top - containerRect.top);

      mainContent.scrollTo({
        top: scrollTarget,
        behavior: 'smooth',
      });
    }
  }
}
