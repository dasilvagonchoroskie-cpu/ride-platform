import 'package:flutter/material.dart';

/// Temas visuais (equivalente aos TEMAS do original).
class TemaVisual {
  const TemaVisual({
    required this.nome,
    required this.rotulo,
    required this.fundo,
    required this.painel,
    required this.texto,
    required this.destaque,
  });

  final String nome;
  final String rotulo;
  final Color fundo;
  final Color painel;
  final Color texto;
  final Color destaque;
}

const List<TemaVisual> temas = [
  TemaVisual(
    nome: 'escuro',
    rotulo: 'Escuro',
    fundo: Color(0xFF0A0E1A),
    painel: Color(0xFF12181F),
    texto: Color(0xFFF4F6F9),
    destaque: Color(0xFF4ADE80),
  ),
  TemaVisual(
    nome: 'meia-noite',
    rotulo: 'Meia-noite',
    fundo: Color(0xFF000000),
    painel: Color(0xFF121212),
    texto: Color(0xFFF0F0F0),
    destaque: Color(0xFF2DD4BF),
  ),
  TemaVisual(
    nome: 'roxo',
    rotulo: 'Roxo',
    fundo: Color(0xFF120A1A),
    painel: Color(0xFF1D1226),
    texto: Color(0xFFF0EAF5),
    destaque: Color(0xFF9D6FE0),
  ),
  TemaVisual(
    nome: 'oceano',
    rotulo: 'Oceano',
    fundo: Color(0xFF0B1220),
    painel: Color(0xFF16233A),
    texto: Color(0xFFE8EEF7),
    destaque: Color(0xFF4C8DFF),
  ),
  TemaVisual(
    nome: 'verde',
    rotulo: 'Verde',
    fundo: Color(0xFF0A140D),
    painel: Color(0xFF122018),
    texto: Color(0xFFE5F2E8),
    destaque: Color(0xFF4ADE80),
  ),
  TemaVisual(
    nome: 'ambar',
    rotulo: 'Ambar',
    fundo: Color(0xFF161819),
    painel: Color(0xFF232628),
    texto: Color(0xFFF4F6F9),
    destaque: Color(0xFFF59E0B),
  ),
];

TemaVisual temaPorNome(String nome) =>
    temas.firstWhere((t) => t.nome == nome, orElse: () => temas.first);

/// Escalas de fonte do medidor.
class EscalaFonte {
  const EscalaFonte({required this.nome, required this.rotulo, required this.fator});

  final String nome;
  final String rotulo;
  final double fator;
}

const List<EscalaFonte> fontes = [
  EscalaFonte(nome: 'normal', rotulo: 'Normal', fator: 1.0),
  EscalaFonte(nome: 'grande', rotulo: 'Grande', fator: 1.2),
  EscalaFonte(nome: 'enorme', rotulo: 'Enorme', fator: 1.45),
];

EscalaFonte fontePorNome(String nome) =>
    fontes.firstWhere((f) => f.nome == nome, orElse: () => fontes.first);

/// Preferencias de aparencia.
class Aparencia {
  Aparencia({this.tema = 'escuro', this.fonte = 'normal'});

  String tema;
  String fonte;

  Map<String, dynamic> toJson() => {'tema': tema, 'fonte': fonte};

  factory Aparencia.fromJson(Map<String, dynamic> json) => Aparencia(
        tema: json['tema'] as String? ?? 'escuro',
        fonte: json['fonte'] as String? ?? 'normal',
      );
}
