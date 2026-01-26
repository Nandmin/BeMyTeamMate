import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privaty-policy-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './privaty-policy.page.html',
  styleUrl: './privaty-policy.page.scss',
})
export class PrivatyPolicyPage {}
