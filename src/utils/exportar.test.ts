import { describe, expect, it } from 'vitest';
import { capasEnCampo, elementosAExportar } from './exportar';
import type { Balon, EquipoRival, JugadorEnCampo, Marcaje, ObjetoCampo, Trazo } from '../types';

/**
 * Qué sale en la imagen exportada (PNG y PDF): lo mismo que en pantalla, menos
 * las capas que el entrenador desmarque en la ventana de exportar.
 */
const titular: JugadorEnCampo = { jugadorId: 'test-09', x: 50, y: 84, zonaOrigenId: 'DC-9', esCapitan: false };
const balonSuelto: Balon = { id: 'b1', x: 50, y: 50, jugadorPoseedorId: null };
const balonEnPosesion: Balon = { id: 'b2', x: 0, y: 0, jugadorPoseedorId: 'test-09' };
const objeto: ObjetoCampo = { id: 'o1', tipo: 'cono', x: 30, y: 20, color: 'naranja', rotacion: 0 };
const trazo: Trazo = { id: 't1', tipo: 'flecha', puntos: [{ x: 10, y: 10 }, { x: 40, y: 40 }], color: '#D4111E', grosor: 2 };
const rival = (cambios: Partial<EquipoRival> = {}): EquipoRival => ({
  nombre: 'Rival',
  formacionId: '4-4-2',
  paleta: 'azul',
  jugadores: [{ id: 'r1', dorsal: 5, posicion: 'DFC', x: 40, y: 80 }],
  visible: true,
  modoVista: 'ambos',
  ...cambios,
});
const marcaje: Marcaje = { id: 'm1', jugadorPropioId: 'test-09', jugadorRivalId: 'r1' };
const campo = (cambios = {}) => ({
  titulares: [titular],
  balones: [balonSuelto, balonEnPosesion],
  objetos: [objeto],
  trazos: [trazo],
  rival: rival(),
  marcajes: [marcaje],
  ...cambios,
});

describe('capasEnCampo: qué casillas ofrece la ventana de exportar', () => {
  it('con todo en el campo, ofrece las cuatro', () => {
    expect(capasEnCampo(campo())).toEqual({ rival: true, balon: true, objetos: true, dibujos: true });
  });

  it('sin nada de eso, no ofrece ninguna', () => {
    expect(capasEnCampo(campo({ rival: null, balones: [], objetos: [], trazos: [] }))).toEqual({
      rival: false,
      balon: false,
      objetos: false,
      dibujos: false,
    });
  });

  it('el rival solo si se ve en pantalla y tiene jugadores', () => {
    expect(capasEnCampo(campo({ rival: rival({ visible: false }) })).rival).toBe(false);
    expect(capasEnCampo(campo({ rival: rival({ modoVista: 'solo_nosotros' }) })).rival).toBe(false);
    expect(capasEnCampo(campo({ rival: rival({ jugadores: [] }) })).rival).toBe(false);
    expect(capasEnCampo(campo({ rival: rival({ modoVista: 'solo_rival' }) })).rival).toBe(true);
  });
});

describe('elementosAExportar: qué se dibuja', () => {
  it('sin desmarcar nada, sale todo lo que se ve en pantalla', () => {
    expect(elementosAExportar(campo())).toEqual({
      objetos: [objeto],
      balonesSueltos: [balonSuelto],
      rivales: rival().jugadores,
      titulares: [titular],
      balonesEnPosesion: [balonEnPosesion],
      dibujos: true,
      marcajes: [{ propio: titular, rival: rival().jugadores[0] }],
    });
  });

  it('cada casilla desmarcada quita solo su capa; nuestros jugadores siempre salen', () => {
    expect(elementosAExportar(campo(), { rival: false }).rivales).toEqual([]);
    expect(elementosAExportar(campo(), { objetos: false }).objetos).toEqual([]);
    expect(elementosAExportar(campo(), { dibujos: false }).dibujos).toBe(false);
    const sinBalon = elementosAExportar(campo(), { balon: false });
    expect(sinBalon.balonesSueltos).toEqual([]);
    expect(sinBalon.balonesEnPosesion).toEqual([]);
    expect(sinBalon.titulares).toEqual([titular]);
    expect(sinBalon.rivales).toEqual(rival().jugadores);

    const nada = elementosAExportar(campo(), { rival: false, balon: false, objetos: false, dibujos: false });
    expect(nada.titulares).toEqual([titular]);
  });

  it('sigue la visibilidad de la pantalla: en "Solo rival" no salen los nuestros, en "Solo nosotros" no sale el rival', () => {
    expect(elementosAExportar(campo({ rival: rival({ modoVista: 'solo_rival' }) })).titulares).toEqual([]);
    expect(elementosAExportar(campo({ rival: rival({ modoVista: 'solo_nosotros' }) })).rivales).toEqual([]);
  });

  it('una línea de marcaje sale solo si salen sus dos jugadores', () => {
    expect(elementosAExportar(campo(), { rival: false }).marcajes).toEqual([]);
    expect(elementosAExportar(campo({ rival: rival({ visible: false }) })).marcajes).toEqual([]);
    expect(elementosAExportar(campo({ rival: rival({ modoVista: 'solo_nosotros' }) })).marcajes).toEqual([]);
    expect(elementosAExportar(campo({ rival: rival({ modoVista: 'solo_rival' }) })).marcajes).toEqual([]);
    const sinSuRival = { ...marcaje, jugadorRivalId: 'r-que-ya-no-esta' };
    expect(elementosAExportar(campo({ marcajes: [sinSuRival] })).marcajes).toEqual([]);
  });
});
