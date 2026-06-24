import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SignPdf } from './sign-pdf';

describe('SignPdf', () => {
  let component: SignPdf;
  let fixture: ComponentFixture<SignPdf>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignPdf],
    }).compileComponents();

    fixture = TestBed.createComponent(SignPdf);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
