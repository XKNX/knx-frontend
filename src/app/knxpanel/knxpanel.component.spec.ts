import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KNXPanelComponent } from './knxpanel.component';

describe('KNXPanelComponent', () => {
  let component: KNXPanelComponent;
  let fixture: ComponentFixture<KNXPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [KNXPanelComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(KNXPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
