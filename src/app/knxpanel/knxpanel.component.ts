import { Component, Input, OnInit } from '@angular/core';
import { HomeAssistant } from '../types';

@Component({
  selector: 'knx-panel',
  templateUrl: './knxpanel.component.html',
  styleUrls: ['./knxpanel.component.scss'],
})
export class KNXPanelComponent implements OnInit {
  @Input()
  hass!: HomeAssistant;

  @Input()
  narrow!: boolean;

  constructor() {}

  ngOnInit(): void {
    console.log(this.hass);
  }
}
