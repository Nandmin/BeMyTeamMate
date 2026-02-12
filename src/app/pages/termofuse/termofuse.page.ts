import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-termofuse-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './termofuse.page.html',
  styleUrl: './termofuse.page.scss',
})
export class TermOfUsePage {
  contactEmail = environment.contactEmail;
}
