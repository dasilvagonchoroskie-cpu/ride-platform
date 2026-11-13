import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_driver/core/utils/geo.dart';
import 'package:mobile_driver/data/models/driver_models.dart';

RideOffer _oferta(List<ParadaDaCorrida> paradas) => RideOffer(
      id: 'r1',
      code: 'FM1',
      passengerName: 'Loja',
      passengerRating: 5,
      pickupAddress: 'Coleta',
      pickupCoords: const Coords(-18, -49),
      dropoffAddress: 'Última',
      dropoffCoords: const Coords(-18.1, -49.1),
      distanceToPickupMeters: 0,
      tripDistanceMeters: 0,
      durationSeconds: 0,
      fareCents: 1000,
      earningCents: 900,
      paymentMethod: 'Dinheiro',
      paradas: paradas,
      entrega: const EntregaDoChamado(descricao: 'item final', destinatarioNome: 'Zé'),
    );

void main() {
  final json = [
    {
      'sequence': 1,
      'address': 'Rua 1',
      'latitude': -18.01,
      'longitude': -49.01,
      'entrega': {'descricao': 'pizza', 'destinatarioNome': 'Ana', 'destinatarioTelefone': '', 'entregue': false},
    },
    {
      'sequence': 2,
      'address': 'Rua 2',
      'latitude': -18.02,
      'longitude': -49.02,
      'entrega': {'descricao': 'bolo', 'destinatarioNome': 'Bia', 'entregue': true},
    },
  ];

  test('as paradas de entrega trazem quem recebe e se já foi entregue; o telefone pode faltar', () {
    final l = ParadaDaCorrida.lista(json);
    expect(l.length, 2);
    expect(l[0].sequencia, 1);
    expect(l[0].entrega!.destinatarioNome, 'Ana');
    expect(l[0].entrega!.destinatarioTelefone, '');
    expect(l[0].entrega!.entregue, isFalse);
    expect(l[1].entrega!.entregue, isTrue);
  });

  test('parada comum (corrida de passageiro) segue sem dados de entrega', () {
    final l = ParadaDaCorrida.lista([
      {'address': 'Padaria', 'latitude': -18.0, 'longitude': -49.0},
    ]);
    expect(l.single.entrega, isNull);
    expect(l.single.sequencia, 1);
    expect(_oferta(l).faltaEntregarParada, isFalse);
  });

  test('falta entregar parada enquanto alguma do caminho não foi confirmada; confirmada libera a última', () {
    var o = _oferta(ParadaDaCorrida.lista(json));
    expect(o.faltaEntregarParada, isTrue);
    o = o.comParadas([for (final p in o.paradas) p.comoEntregue()]);
    expect(o.faltaEntregarParada, isFalse);
    expect(o.paradas.every((p) => p.entrega!.entregue), isTrue);
  });

  test('o estado entregue sobrevive a guardar e ler a corrida (app fechado no meio)', () {
    final o = _oferta(ParadaDaCorrida.lista(json)).comParadas([ParadaDaCorrida.lista(json).first.comoEntregue()]);
    final ride = DriverRide(offer: o, phase: RidePhase.inProgress, pin: '1', startedAt: '2026-11-13T10:00:00Z');
    final volta = DriverRide.fromJson(ride.toJson());
    expect(volta.offer.paradas.single.entrega!.entregue, isTrue);
    expect(volta.offer.paradas.single.entrega!.destinatarioNome, 'Ana');
  });
}
